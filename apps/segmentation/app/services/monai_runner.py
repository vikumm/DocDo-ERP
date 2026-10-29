"""MONAI runner: real Vista3D / NV-Segment-CT inference via MONAI bundles.

Bundles are downloaded lazily (per model, under a lock) on first use into
`SEG_MODEL_DIR` (default ./models) via `monai.bundle.download`. Auto jobs run
the bundle's inference workflow on the session volume; interactive jobs
(Vista3D only) pass point prompts and reuse a per-session image embedding from
an in-memory LRU cache (`SEG_EMBED_CACHE` entries).

Bundle overrides go to ConfigWorkflow at construction (its run() takes no
args); each job builds its own workflow so overrides stay per-job. The
Vista3D embedding extraction/injection points are bundle internals and marked
UNCERTAIN in the notepad — kept behind small seams (_extract_embedding /
_embed_override) so tests can mock and we can adjust without touching the flow.

Heavy imports (torch/monai) happen lazily inside functions so this module is
importable (and testable) without the monai stack installed.
"""

import asyncio
import functools
import logging
import threading
from collections import OrderedDict
from pathlib import Path
from typing import Any

import nibabel as nib
import numpy as np

from app.config import settings
from app.models import SegJob

log = logging.getLogger("seg.monai")

BUNDLE_NAMES = {"vista3d": "vista3d", "nv_segment_ct": "segment_ct"}

_download_lock = threading.Lock()  # bundle download guard (per process)


class ParamError(ValueError):
    """Bad job params — job fails with a client error, not a server error."""


def _device() -> str:
    import torch

    return "cuda" if torch.cuda.is_available() else "cpu"


def _model_dir() -> Path:
    d = Path(settings.seg_model_dir)
    d.mkdir(parents=True, exist_ok=True)
    return d


def bundle_root(model: str) -> Path:
    """Download bundle if missing; return its local root path. Thread-safe."""
    bundle = BUNDLE_NAMES[model]
    root = _model_dir() / bundle
    with _download_lock:
        if not (root / "configs").exists():
            from monai.bundle import download

            log.info("downloading bundle %s (%s) to %s", bundle, model, root)
            download(name=bundle, bundle_dir=str(_model_dir()), progress=False)
        else:
            log.debug("bundle %s already present at %s", bundle, root)
    return root


def _build_workflow(model: str, overrides: dict[str, Any] | None = None):
    """Build an initialized bundle inference workflow with per-job overrides."""
    from monai.bundle import ConfigWorkflow

    root = bundle_root(model)
    wf = ConfigWorkflow(
        config_file=str(root / "configs" / "inference.json"),
        workflow_type="inference",
        device=_device(),
        bundle_root=str(root),
        **(overrides or {}),
    )
    wf.initialize()
    return wf


# --- per-session embedding cache (interactive Vista3D) ---


class EmbedCache:
    """Thread-safe LRU {session_id: (image_embedding, meta)}."""

    def __init__(self, capacity: int):
        self._cap = max(1, capacity)
        self._d: OrderedDict[Any, Any] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key):
        with self._lock:
            if key in self._d:
                self._d.move_to_end(key)
                return self._d[key]
        return None

    def put(self, key, value) -> None:
        with self._lock:
            self._d[key] = value
            self._d.move_to_end(key)
            while len(self._d) > self._cap:
                evicted = self._d.popitem(last=False)
                log.info("embedding cache evicted session %s", evicted[0])

    def __len__(self) -> int:
        with self._lock:
            return len(self._d)


_embed_cache = EmbedCache(settings.seg_embed_cache)


def _extract_embedding(wf) -> Any:
    """Best-effort extraction of the Vista3D image embedding from a run
    workflow. Bundle internals — UNCERTAIN until validated against the real
    bundle. Returns None when unavailable (caller then skips caching)."""
    for attr in ("image_embedding", "_embedding"):
        v = getattr(wf, attr, None)
        if v is not None:
            return v
    return None


def _embed_override(embedding: Any) -> dict[str, Any]:
    """Override pair to inject a cached embedding into a fresh workflow."""
    return {"image_embedding": embedding}


# --- params validation ---


def validate_points(params: dict | None) -> list[dict]:
    """Validate interactive `points`. Each: {"x","y","z" numeric + optional
    "pos": bool (default True)}. Raises ParamError."""
    points = (params or {}).get("points")
    if not isinstance(points, list) or len(points) == 0:
        raise ParamError("interactive job requires non-empty params.points")
    out = []
    for p in points:
        if not isinstance(p, dict):
            raise ParamError("each point must be an object")
        try:
            x, y, z = float(p["x"]), float(p["y"]), float(p["z"])
        except (KeyError, TypeError, ValueError):
            raise ParamError("each point requires numeric x/y/z") from None
        if not all(np.isfinite(v) for v in (x, y, z)):
            raise ParamError("point coords must be finite")
        out.append({"x": x, "y": y, "z": z, "pos": bool(p.get("pos", True))})
    return out


def validate_label(params: dict | None) -> int | None:
    label = (params or {}).get("label")
    if label is None:
        return None
    if isinstance(label, bool) or not isinstance(label, int) or label < 0:
        raise ParamError("params.label must be a non-negative int")
    return label


# --- inference core (sync; runs in a worker thread) ---


def _point_tensors(points: list[dict], ref: nib.Nifti1Image):
    """Vista3D point prompts: coords [1,N,3] in voxel-index space divided by
    voxel spacing (bundle transforms expect spacing-normalized coords),
    labels [1,N] with 1=positive, 0=negative."""
    try:
        import torch

        tensor = torch.tensor
    except ModuleNotFoundError:
        tensor = np.array
    zooms = np.array(ref.header.get_zooms()[:3], dtype=np.float32)
    coords = tensor([[[p["x"], p["y"], p["z"]] for p in points]], dtype=np.float32) / zooms
    labels = tensor([[1 if p["pos"] else 0 for p in points]], dtype=np.float32)
    return coords, labels


def _normalize_labelmap(out: Path, ref: nib.Nifti1Image) -> None:
    """Post-process bundle output in place: int labels, same geometry/affine/
    header as the session volume."""
    img = nib.load(out)
    data = np.asanyarray(img.dataobj)
    if data.ndim == 5:
        data = data[0]
    if data.shape[0] == 1:
        data = data[0]
    elif data.ndim == 4:
        data = np.argmax(data, axis=0)
    data = data.astype(np.int16)
    dtype = np.uint8 if int(data.max()) <= 255 else np.int16
    fixed = nib.Nifti1Image(data.astype(dtype), ref.affine, header=ref.header)
    fixed.set_data_dtype(dtype)
    nib.save(fixed, out)


def _run_auto(model: str, volume: Path, session_dir: Path) -> Path:
    out = session_dir / "labelmap.nii.gz"
    wf = _build_workflow(model, {"input#image": str(volume), "output#path": str(out)})
    wf.run()
    wf.finalize()
    if not out.exists():
        raise RuntimeError(f"bundle {model} produced no output at {out}")
    _normalize_labelmap(out, nib.load(volume))
    return out


def _run_interactive(
    model: str, session_id, points: list[dict], label: int | None, volume: Path, session_dir: Path
) -> Path:
    if model != "vista3d":
        raise ParamError("interactive jobs are only supported with model=vista3d")

    out = session_dir / "labelmap.nii.gz"
    ref = nib.load(volume)
    coords, plabels = _point_tensors(points, ref)
    overrides: dict[str, Any] = {
        "input#image": str(volume),
        "point_coords": coords,
        "point_labels": plabels,
        "output#path": str(out),
    }
    if label is not None:
        overrides["label_prompt"] = np.array([[label]], dtype=np.float32)

    cached = _embed_cache.get(str(session_id))
    if cached is not None:
        embedding, _meta = cached
        log.info("session %s: reusing cached embedding", session_id)
        overrides.update(_embed_override(embedding))

    wf = _build_workflow(model, overrides)
    wf.run()
    wf.finalize()
    if not out.exists():
        raise RuntimeError(f"bundle {model} produced no output at {out}")

    embedding = _extract_embedding(wf)
    if embedding is not None:
        _embed_cache.put(str(session_id), (embedding, {"shape": ref.shape}))
    else:
        log.warning("session %s: could not extract embedding for cache", session_id)
    _normalize_labelmap(out, ref)
    return out


class MonaiRunner:
    """Real MONAI runner. Sync torch work runs in a worker thread."""

    async def run(self, job: SegJob, session_dir: Path) -> Path:
        vol = session_dir / "volume.nii.gz"
        if not vol.exists():
            vol = session_dir / "volume.nii"
        if not vol.exists():
            raise FileNotFoundError(f"no volume uploaded for session {job.session_id}")

        params = job.params or {}
        if job.kind == "interactive":
            points = validate_points(params)
            label = validate_label(params)
            fn = functools.partial(
                _run_interactive, job.model, job.session_id, points, label, vol, session_dir
            )
        else:
            if params.get("points") is not None:
                raise ParamError("params.points only valid for interactive jobs")
            fn = functools.partial(_run_auto, job.model, vol, session_dir)
        out = await asyncio.to_thread(fn)
        log.info("monai runner wrote %s for job %s", out, job.id)
        return out

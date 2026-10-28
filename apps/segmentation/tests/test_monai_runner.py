"""MONAI runner tests — no torch/monai needed (mocked); slow integration gated
behind SEG_INTEGRATION=1."""

import gzip
import tempfile
import uuid
from pathlib import Path

import nibabel as nib
import numpy as np
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.models import Base, SegJob


def nifti_file(shape=(4, 4, 4), affine=np.eye(4)) -> Path:
    img = nib.Nifti1Image(np.zeros(shape, dtype=np.uint8), affine)
    f = tempfile.NamedTemporaryFile(suffix=".nii.gz", delete=False)
    nib.save(img, f.name)
    return Path(f.name)


def job(kind="auto", model="vista3d", params=None, session_id=None) -> SegJob:
    return SegJob(session_id=session_id or uuid.uuid4(), kind=kind, model=model, params=params)


# --- runner selection ---


def test_get_runner_mock_by_default(monkeypatch):
    from app.services import runner as r

    monkeypatch.setattr(settings, "seg_runner", "mock")
    assert isinstance(r.get_runner(), r.MockRunner)


def test_get_runner_monai(monkeypatch):
    from app.services.monai_runner import MonaiRunner
    from app.services import runner as r

    monkeypatch.setattr(settings, "seg_runner", "monai")
    assert isinstance(r.get_runner(), MonaiRunner)


# --- param validation (unit) ---


def test_validate_points_ok():
    from app.services.monai_runner import validate_points

    pts = validate_points({"points": [{"x": 1, "y": 2, "z": 3}, {"x": 0.5, "y": 0, "z": -1, "pos": False}]})
    assert pts[0]["pos"] is True and pts[1]["pos"] is False


@pytest.mark.parametrize(
    "params",
    [
        None,
        {},
        {"points": []},
        {"points": "nope"},
        {"points": [{"x": 1, "y": 2}]},
        {"points": [{"x": "a", "y": 2, "z": 3}]},
        {"points": [{"x": float("nan"), "y": 2, "z": 3}]},
        {"points": [5]},
    ],
)
def test_validate_points_bad(params):
    from app.services.monai_runner import ParamError, validate_points

    with pytest.raises(ParamError):
        validate_points(params)


def test_validate_label():
    from app.services.monai_runner import ParamError, validate_label

    assert validate_label(None) is None
    assert validate_label({"label": 3}) == 3
    for bad in [-1, "3", 1.5, True]:
        with pytest.raises(ParamError):
            validate_label({"label": bad})


# --- runner-level validation without monai installed ---


async def test_runner_interactive_requires_points(tmp_path):
    from app.services.monai_runner import ParamError

    vol = tmp_path / "volume.nii.gz"
    nib.save(nib.Nifti1Image(np.zeros((4, 4, 4), np.uint8), np.eye(4)), vol)
    from app.services.monai_runner import MonaiRunner

    with pytest.raises(ParamError):
        await MonaiRunner().run(job(kind="interactive"), tmp_path)


async def test_runner_interactive_rejects_non_vista3d(tmp_path):
    from app.services.monai_runner import ParamError

    vol = tmp_path / "volume.nii.gz"
    nib.save(nib.Nifti1Image(np.zeros((4, 4, 4), np.uint8), np.eye(4)), vol)
    from app.services.monai_runner import MonaiRunner

    with pytest.raises(ParamError):
        await MonaiRunner().run(
            job(kind="interactive", model="nv_segment_ct", params={"points": [{"x": 1, "y": 1, "z": 1}]}),
            tmp_path,
        )


async def test_runner_auto_rejects_points(tmp_path):
    from app.services.monai_runner import ParamError

    vol = tmp_path / "volume.nii.gz"
    nib.save(nib.Nifti1Image(np.zeros((4, 4, 4), np.uint8), np.eye(4)), vol)
    from app.services.monai_runner import MonaiRunner

    with pytest.raises(ParamError):
        await MonaiRunner().run(job(params={"points": [{"x": 1, "y": 1, "z": 1}]}), tmp_path)


async def test_runner_missing_volume(tmp_path):
    from app.services.monai_runner import MonaiRunner

    with pytest.raises(FileNotFoundError):
        await MonaiRunner().run(job(), tmp_path)


# --- API-level: bad interactive params -> 400 ---


async def test_job_rejects_bad_points():
    from app.main import app
    from app.db import get_db

    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    S = async_sessionmaker(engine, expire_on_commit=False)

    async def dep():
        async with S() as s:
            yield s

    app.dependency_overrides[get_db] = dep
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            import tempfile

            settings.seg_store_dir = tempfile.mkdtemp()
            r = await c.post("/v1/sessions")
            sid = r.json()["id"]
            r = await c.post(
                "/v1/jobs",
                json={"session_id": sid, "kind": "interactive", "model": "vista3d", "params": {"points": []}},
            )
            assert r.status_code == 400
            r = await c.post(
                "/v1/jobs",
                json={
                    "session_id": sid,
                    "kind": "interactive",
                    "model": "vista3d",
                    "params": {"points": [{"x": 1, "y": 2}], "label": -2},
                },
            )
            assert r.status_code == 400
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


# --- labelmap geometry pass-through ---


def test_normalize_labelmap_geometry():
    from app.services.monai_runner import _normalize_labelmap

    affine = np.diag([2.0, 2.0, 3.0, 1.0])
    ref = nib.Nifti1Image(np.zeros((8, 8, 6), np.float32), affine)
    ref.header.set_zooms((2.0, 2.0, 3.0))

    out = Path(tempfile.mkdtemp()) / "lm.nii.gz"
    # simulate bundle output: float logits, extra channel dim
    logits = np.random.rand(1, 3, 8, 8, 6).astype(np.float32)
    nib.save(nib.Nifti1Image(logits, np.eye(4)), out)  # wrong affine on purpose

    _normalize_labelmap(out, ref)
    img = nib.load(out)
    assert img.shape == (8, 8, 6)
    assert np.allclose(img.affine, affine)
    data = np.asanyarray(img.dataobj)
    assert data.dtype == np.uint8
    assert set(np.unique(data)) <= {0, 1, 2}  # argmax over 3 channels


def test_normalize_labelmap_binary_channel():
    from app.services.monai_runner import _normalize_labelmap

    ref = nib.Nifti1Image(np.zeros((5, 5, 5)), np.eye(4))
    out = Path(tempfile.mkdtemp()) / "lm.nii.gz"
    nib.save(nib.Nifti1Image(np.random.rand(1, 1, 5, 5, 5).astype(np.float32), np.eye(4)), out)
    _normalize_labelmap(out, ref)
    data = np.asanyarray(nib.load(out).dataobj)
    assert data.shape == (5, 5, 5)
    assert set(np.unique(data)) <= {0, 1}


# --- embedding cache LRU ---


def test_embed_cache_lru_eviction():
    from app.services.monai_runner import EmbedCache

    c = EmbedCache(capacity=2)
    c.put("a", ("emb-a", {}))
    c.put("b", ("emb-b", {}))
    assert c.get("a") is not None  # touch a -> b is LRU
    c.put("c", ("emb-c", {}))  # evicts b
    assert len(c) == 2
    assert c.get("b") is None
    assert c.get("a")[0] == "emb-a"
    assert c.get("c")[0] == "emb-c"


def test_embed_cache_capacity_1():
    from app.services.monai_runner import EmbedCache

    c = EmbedCache(capacity=1)
    c.put("a", 1)
    c.put("b", 2)
    assert c.get("a") is None
    assert c.get("b") == 2


def test_embed_cache_get_moves_to_end():
    from app.services.monai_runner import EmbedCache

    c = EmbedCache(capacity=2)
    c.put("a", 1)
    c.put("b", 2)
    assert c.get("a") == 1
    c.put("c", 3)
    assert c.get("a") == 1 and c.get("b") is None


# --- interactive flow with mocked bundle ---


async def test_interactive_reuses_cached_embedding(tmp_path, monkeypatch):
    import app.services.monai_runner as mr

    affine = np.eye(4)
    ref = nib.Nifti1Image(np.zeros((4, 4, 4), np.uint8), affine)
    ref.header.set_zooms((1.0, 1.0, 1.0))
    vol = tmp_path / "volume.nii.gz"
    nib.save(ref, vol)

    calls = []

    class FakeWF:
        def __init__(self, model, overrides):
            self.model, self.overrides = model, overrides
            self.image_embedding = None
            calls.append(("build", dict(overrides)))

        def initialize(self):
            pass

        def run(self):
            self.image_embedding = f"emb-{len(calls)}"
            out = Path(self.overrides["output#path"])
            nib.save(nib.Nifti1Image(np.zeros((1, 1, 4, 4, 4), np.float32), affine), out)

        def finalize(self):
            pass

    monkeypatch.setattr(mr, "_build_workflow", lambda model, overrides=None: FakeWF(model, dict(overrides or {})))
    monkeypatch.setattr(mr, "bundle_root", lambda model: tmp_path)
    cache = mr.EmbedCache(4)
    monkeypatch.setattr(mr, "_embed_cache", cache)

    j = job(kind="interactive", params={"points": [{"x": 1, "y": 1, "z": 1}], "label": 2})
    out1 = await mr.MonaiRunner().run(j, tmp_path)
    j2 = job(kind="interactive", session_id=j.session_id, params={"points": [{"x": 2, "y": 0, "z": 0}]})
    out2 = await mr.MonaiRunner().run(j2, tmp_path)

    assert out1.exists() and out2.exists()
    assert len(cache) == 1  # same session reused
    builds = [c for c in calls if c[0] == "build"]
    assert builds[1][1]["image_embedding"] == "emb-1"  # cached injected
    img = nib.load(out2)
    assert img.shape == (4, 4, 4)
    assert np.allclose(img.affine, affine)


def test_extract_embedding_none_when_absent():
    from app.services.monai_runner import _extract_embedding

    class Bare:
        pass

    assert _extract_embedding(Bare()) is None


# --- slow real-inference integration (SEG_INTEGRATION=1) ---


@pytest.mark.slow
@pytest.mark.skipif(__import__("os").environ.get("SEG_INTEGRATION") != "1", reason="SEG_INTEGRATION!=1")
async def test_real_vista3d_cpu_tiny_volume(tmp_path):
    from app.services.monai_runner import MonaiRunner

    vol = tmp_path / "volume.nii.gz"
    nib.save(nib.Nifti1Image(np.zeros((64, 64, 64), np.float32), np.eye(4)), vol)
    j = job(kind="interactive", params={"points": [{"x": 32, "y": 32, "z": 32}], "label": 1})
    out = await MonaiRunner().run(j, tmp_path)
    assert out.exists()
    assert nib.load(out).shape == (64, 64, 64)

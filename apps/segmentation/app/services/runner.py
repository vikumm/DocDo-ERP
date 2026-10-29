"""Runner selection. MONAI runner (app.services.monai_runner) is used via SEG_RUNNER=monai."""

import logging
import uuid
from pathlib import Path
from typing import Protocol

import nibabel as nib
import numpy as np

from app.config import settings
from app.models import SegJob

log = logging.getLogger("seg.runner")


class Runner(Protocol):
    async def run(self, job: SegJob, session_dir: Path) -> Path:
        """Produce a labelmap NIfTI for the session volume; return its path."""
        ...


class MockRunner:
    async def run(self, job: SegJob, session_dir: Path) -> Path:
        import asyncio

        vol = session_dir / "volume.nii.gz"
        if not vol.exists():
            vol = session_dir / "volume.nii"
        if not vol.exists():
            raise FileNotFoundError(f"no volume uploaded for session {job.session_id}")
        img = nib.load(vol)
        data = np.zeros(img.shape, dtype=np.uint8)
        out = session_dir / "labelmap.nii.gz"
        await asyncio.to_thread(lambda: nib.save(nib.Nifti1Image(data, img.affine, header=img.header), out))
        log.info("mock runner wrote %s", out)
        return out


def get_runner() -> Runner:
    if settings.seg_runner == "monai":
        from app.services.monai_runner import MonaiRunner

        return MonaiRunner()
    return MockRunner()

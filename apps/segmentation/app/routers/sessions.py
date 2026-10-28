import json
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models import SessionRow
from app.schemas import SessionOut
from app.services import store

log = logging.getLogger("seg.sessions")
router = APIRouter(prefix="/sessions", tags=["sessions"])

ALLOWED_VOLUME_EXT = (".nii", ".nii.gz")


async def _require_session(session_id: uuid.UUID, db: AsyncSession) -> SessionRow:
    row = await db.get(SessionRow, session_id)
    if row is None or not store.session_exists(session_id):
        raise HTTPException(status_code=404, detail="session not found")
    return row


def _validate_nifti(filename: str | None) -> str:
    if not filename or not filename.lower().endswith(ALLOWED_VOLUME_EXT):
        raise HTTPException(status_code=400, detail=f"file must be NIfTI ({'/'.join(ALLOWED_VOLUME_EXT)})")
    return filename


@router.post("", status_code=201, response_model=SessionOut)
async def create_session(db: AsyncSession = Depends(get_db)) -> SessionOut:
    row = SessionRow()
    db.add(row)
    await db.commit()
    store.session_dir(row.id)  # mkdir
    return SessionOut(id=row.id)


@router.post("/{session_id}/volume")
async def upload_volume(
    session_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await _require_session(session_id, db)
    _validate_nifti(file.filename)
    # normalize name so runner can find it
    suffix = ".nii.gz" if file.filename.lower().endswith(".nii.gz") else ".nii"
    dest = store.session_dir(session_id) / f"volume{suffix}"
    size = 0
    try:
        with open(dest, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.seg_max_upload_bytes:
                    raise HTTPException(status_code=413, detail="file exceeds SEG_MAX_UPLOAD_BYTES")
                out.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    return {"session_id": str(session_id), "stored": str(dest), "bytes": size}


@router.get("/{session_id}/volume")
async def download_volume(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> FileResponse:
    await _require_session(session_id, db)
    for name in ("volume.nii.gz", "volume.nii"):
        p = store.session_dir(session_id) / name
        if p.exists():
            return FileResponse(p, filename=name, media_type="application/octet-stream")
    raise HTTPException(status_code=404, detail="volume not uploaded")


@router.get("/{session_id}/labelmap")
async def download_labelmap(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> FileResponse:
    await _require_session(session_id, db)
    p = store.session_dir(session_id) / "labelmap.nii.gz"
    if not p.exists():
        raise HTTPException(status_code=404, detail="no labelmap yet")
    return FileResponse(p, filename="labelmap.nii.gz", media_type="application/octet-stream")


@router.post("/{session_id}/feedback")
async def feedback(
    session_id: uuid.UUID,
    labelmap: UploadFile = File(...),
    prompt_log: UploadFile = File(...),
    original: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await _require_session(session_id, db)
    _validate_nifti(labelmap.filename)
    if original is not None:
        _validate_nifti(original.filename)

    fb_dir = store.session_dir(session_id) / "feedback"
    fb_dir.mkdir(exist_ok=True)

    stored = []

    async def save(part: UploadFile, name: str) -> dict:
        dest = fb_dir / name
        size = 0
        with open(dest, "wb") as out:
            while chunk := await part.read(1024 * 1024):
                size += len(chunk)
                if size > settings.seg_max_upload_bytes:
                    dest.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail=f"{name} exceeds SEG_MAX_UPLOAD_BYTES")
                out.write(chunk)
        return {"path": str(dest), "bytes": size}

    # validate prompt_log is JSON before persisting
    raw = await prompt_log.read()
    try:
        json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="prompt_log must be valid JSON")
    pl_dest = fb_dir / "prompt_log.json"
    pl_dest.write_bytes(raw)
    stored.append({"path": str(pl_dest), "bytes": len(raw)})

    stored.append(await save(labelmap, "edited_labelmap.nii.gz"))
    if original is not None:
        stored.append(await save(original, "original.nii.gz"))

    return {"session_id": str(session_id), "stored": stored}

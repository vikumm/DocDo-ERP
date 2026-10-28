import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.schemas import JobCreate, JobOut
from app.services import queue, store

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("", status_code=201, response_model=JobOut)
async def create_job(body: JobCreate, db: AsyncSession = Depends(get_db)) -> JobOut:
    if not store.session_exists(body.session_id):
        raise HTTPException(status_code=404, detail="session not found")
    if body.kind == "interactive" or (body.params or {}).get("points") is not None:
        try:
            from app.services.monai_runner import validate_label, validate_points

            validate_points(body.params)
            validate_label(body.params)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
    job = await queue.enqueue(db, body.session_id, body.kind, body.model, body.params)
    return JobOut.from_job(job)


@router.get("/{job_id}", response_model=JobOut)
async def job_status(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> JobOut:
    job = await queue.get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return JobOut.from_job(job)


@router.get("", response_model=list[JobOut])
async def list_jobs(session_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)) -> list[JobOut]:
    jobs = await queue.list_jobs(db, session_id)
    return [JobOut.from_job(j) for j in jobs]

import logging
import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SegJob

log = logging.getLogger("seg.queue")

CLAIM_SQL_PG = text(
    """
    UPDATE seg_job SET status = 'running', updated_at = CURRENT_TIMESTAMP
    WHERE id = (
        SELECT id FROM seg_job
        WHERE status = 'queued'
        ORDER BY created_at, id
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING id, session_id, kind, model, status, params, created_at, updated_at
    """
)


async def enqueue(db: AsyncSession, session_id: uuid.UUID, kind: str, model: str, params: dict | None) -> SegJob:
    job = SegJob(session_id=session_id, kind=kind, model=model, params=params, status="queued")
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


async def claim_next(db: AsyncSession) -> SegJob | None:
    """Claim the oldest queued job. Uses FOR UPDATE SKIP LOCKED on postgres; on sqlite
    (tests) falls back to a plain UPDATE ... WHERE id = (SELECT ...) which is equivalent
    under a single worker."""
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        row = (await db.execute(CLAIM_SQL_PG)).mappings().first()
        if row is None:
            # The UPDATE takes the write lock even with zero rows; end the autobegun
            # tx now so we don't hold it across the worker's idle wait.
            await db.rollback()
            return None
        await db.commit()
        return SegJob(
            id=uuid.UUID(str(row["id"])), session_id=uuid.UUID(str(row["session_id"])), kind=row["kind"], model=row["model"],
            status=row["status"], params=row["params"], created_at=row["created_at"], updated_at=row["updated_at"],
        )
    row = (
        await db.execute(
            text(
                """
                UPDATE seg_job SET status = 'running', updated_at = CURRENT_TIMESTAMP
                WHERE id = (SELECT id FROM seg_job WHERE status = 'queued' ORDER BY created_at, rowid LIMIT 1)
                RETURNING id, session_id, kind, model, status, params, created_at, updated_at
                """
            )
        )
    ).mappings().first()
    if row is None:
        # Same as the pg branch: end the autobegun tx instead of holding the
        # sqlite write lock across the worker's idle wait.
        await db.rollback()
        return None
    await db.commit()
    return SegJob(
        id=uuid.UUID(str(row["id"])), session_id=uuid.UUID(str(row["session_id"])), kind=row["kind"], model=row["model"],
        status=row["status"], params=row["params"], created_at=row["created_at"], updated_at=row["updated_at"],
    )


async def finish(db: AsyncSession, job_id: uuid.UUID, status: str) -> None:
    from sqlalchemy import update

    await db.execute(update(SegJob).where(SegJob.id == job_id).values(status=status))
    await db.commit()


async def queue_depth(db: AsyncSession) -> int:
    res = await db.execute(text("SELECT count(*) FROM seg_job WHERE status = 'queued'"))
    return int(res.scalar() or 0)


async def get_job(db: AsyncSession, job_id: uuid.UUID) -> SegJob | None:
    return await db.get(SegJob, job_id)


async def list_jobs(db: AsyncSession, session_id: uuid.UUID | None = None) -> list[SegJob]:
    from sqlalchemy import select

    q = select(SegJob).order_by(SegJob.created_at.desc()).limit(200)
    if session_id is not None:
        q = q.where(SegJob.session_id == session_id)
    return list((await db.scalars(q)).all())

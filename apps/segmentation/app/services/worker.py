import asyncio
import logging

from app.db import SessionLocal
from app.services import queue
from app.services.runner import get_runner

log = logging.getLogger("seg.worker")


async def worker_loop() -> None:
    """Single-concurrency job worker. Claims via FOR UPDATE SKIP LOCKED so multiple
    replicas stay safe, but each replica processes one job at a time."""
    runner = get_runner()
    from app.services import store

    while True:
        try:
            async with SessionLocal() as db:
                job = await queue.claim_next(db)
                if job is None:
                    await asyncio.sleep(1)
                    continue
                log.info("job %s (%s/%s) claimed", job.id, job.kind, job.model)
                session_dir = store.session_dir(job.session_id)
                try:
                    await runner.run(job, session_dir)
                    await queue.finish(db, job.id, "done")
                except NotImplementedError:
                    await queue.finish(db, job.id, "error")
                    log.error("job %s: runner not implemented", job.id)
                except Exception:
                    await queue.finish(db, job.id, "error")
                    log.exception("job %s failed", job.id)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("worker loop error")
            await asyncio.sleep(1)

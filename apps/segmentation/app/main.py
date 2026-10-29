import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_client import Gauge, make_asgi_app  # type: ignore

from app.db import SessionLocal
from app.routers import health, jobs, sessions
from app.services import store
from app.services.worker import worker_loop

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("seg")

queue_depth = Gauge("seg_queue_depth", "Number of queued segmentation jobs")


async def _metrics_loop():
    from sqlalchemy import text

    while True:
        try:
            async with SessionLocal() as db:
                n = (await db.execute(text("SELECT count(*) FROM seg_job WHERE status='queued'"))).scalar()
                queue_depth.set(int(n or 0))
        except Exception:
            pass
        import asyncio

        await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio

    tasks = [
        asyncio.create_task(worker_loop(), name="worker"),
        asyncio.create_task(store.ttl_cleanup_loop(), name="ttl"),
        asyncio.create_task(_metrics_loop(), name="metrics"),
    ]
    log.info("segmentation service up (runner from SEG_RUNNER)")
    yield
    for t in tasks:
        t.cancel()


app = FastAPI(title="docdo-segmentation", version="0.1.0", lifespan=lifespan)
app.include_router(health.router)
app.include_router(sessions.router, prefix="/v1")
app.include_router(jobs.router, prefix="/v1")
app.mount("/metrics", make_asgi_app())

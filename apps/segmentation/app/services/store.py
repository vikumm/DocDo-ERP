import asyncio
import logging
import shutil
import time
import uuid
from pathlib import Path

from app.config import settings

log = logging.getLogger("seg.store")


def store_root() -> Path:
    root = Path(settings.seg_store_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def session_dir(session_id: uuid.UUID | str) -> Path:
    d = store_root() / str(session_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def session_exists(session_id: uuid.UUID | str) -> bool:
    return (store_root() / str(session_id)).is_dir()


def delete_session(session_id: uuid.UUID | str) -> None:
    shutil.rmtree(store_root() / str(session_id), ignore_errors=True)


async def ttl_cleanup_loop() -> None:
    """Delete session dirs older than SEG_TTL_HOURS."""
    while True:
        try:
            cutoff = time.time() - settings.seg_ttl_hours * 3600
            for d in store_root().iterdir():
                if d.is_dir() and d.stat().st_mtime < cutoff:
                    log.info("ttl: removing expired session %s", d.name)
                    shutil.rmtree(d, ignore_errors=True)
        except Exception:
            log.exception("ttl cleanup failed")
        await asyncio.sleep(600)

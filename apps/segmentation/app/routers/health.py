import logging

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.services import store

log = logging.getLogger("seg.health")
router = APIRouter(tags=["health"])


@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)) -> dict:
    db_ok = True
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    store_ok = True
    try:
        store.store_root()
    except Exception:
        store_ok = False
    status = "ok" if (db_ok and store_ok) else "degraded"
    return {"status": status, "db": db_ok, "store": store_ok}

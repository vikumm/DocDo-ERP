import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SegJob(Base):
    __tablename__ = "seg_job"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # auto | interactive
    model: Mapped[str] = mapped_column(String(32), nullable=False)  # vista3d | nv_segment_ct
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="queued", index=True)
    params: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SessionRow(Base):
    """Sessions live on disk (SEG_STORE_DIR/<id>); this table tracks created_at for TTL cleanup."""
    __tablename__ = "seg_session"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

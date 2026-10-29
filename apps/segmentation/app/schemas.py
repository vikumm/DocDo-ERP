import json
import uuid
from typing import Any

from pydantic import BaseModel, Field


class JobCreate(BaseModel):
    session_id: uuid.UUID
    kind: str = Field(pattern="^(auto|interactive)$")
    model: str = Field(pattern="^(vista3d|nv_segment_ct)$")
    params: dict[str, Any] | None = None


class JobOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    kind: str
    model: str
    status: str
    params: dict | None
    created_at: str | None = None
    updated_at: str | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_job(cls, job) -> "JobOut":
        return cls(
            id=job.id,
            session_id=job.session_id,
            kind=job.kind,
            model=job.model,
            status=job.status,
            params=job.params,
            created_at=job.created_at.isoformat() if job.created_at else None,
            updated_at=job.updated_at.isoformat() if job.updated_at else None,
        )


class SessionOut(BaseModel):
    id: uuid.UUID


class FeedbackOut(BaseModel):
    stored: list[dict]

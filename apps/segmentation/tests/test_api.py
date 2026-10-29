import gzip
import io
import json
import tempfile
import uuid
from pathlib import Path

import nibabel as nib
import numpy as np
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.db as db_mod
from app.config import settings
from app.models import Base


@pytest_asyncio.fixture
async def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "seg_store_dir", str(tmp_path / "store"))
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    TestSession = async_sessionmaker(engine, expire_on_commit=False)
    # app lifespan (worker etc.) not started: use ASGITransport without lifespan
    async def override_get_db():
        async with TestSession() as s:
            yield s

    from app.main import app
    from app.db import get_db

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        yield c
    app.dependency_overrides.clear()
    await engine.dispose()


def nifti_gz_bytes(shape=(4, 4, 4)) -> bytes:
    import gzip

    img = nib.Nifti1Image(np.zeros(shape, dtype=np.uint8), np.eye(4))
    with tempfile.NamedTemporaryFile(suffix=".nii.gz") as f:
        nib.save(img, f.name)
        return gzip.compress if False else Path(f.name).read_bytes()


async def new_session(client) -> str:
    r = await client.post("/v1/sessions")
    assert r.status_code == 201, r.text
    return r.json()["id"]


# --- upload validation ---


async def test_upload_rejects_non_nifti(client):
    sid = await new_session(client)
    r = await client.post(
        f"/v1/sessions/{sid}/volume",
        files={"file": ("scan.dcm", b"whatever")},
    )
    assert r.status_code == 400


async def test_upload_rejects_oversize(client, monkeypatch):
    monkeypatch.setattr(settings, "seg_max_upload_bytes", 10)
    sid = await new_session(client)
    r = await client.post(
        f"/v1/sessions/{sid}/volume",
        files={"file": ("scan.nii", b"x" * 100)},
    )
    assert r.status_code == 413
    # partial file removed
    assert not (Path(settings.seg_store_dir) / sid / "volume.nii").exists()


async def test_upload_and_download_roundtrip(client):
    sid = await new_session(client)
    data = nifti_gz_bytes()
    r = await client.post(f"/v1/sessions/{sid}/volume", files={"file": ("scan.nii.gz", data)})
    assert r.status_code == 200, r.text
    r = await client.get(f"/v1/sessions/{sid}/volume")
    assert r.status_code == 200
    assert r.content == data


async def test_upload_404_unknown_session(client):
    r = await client.post(f"/v1/sessions/{uuid.uuid4()}/volume", files={"file": ("a.nii", b"")})
    assert r.status_code == 404


# --- feedback ---


async def test_feedback_stores_files(client):
    sid = await new_session(client)
    r = await client.post(
        f"/v1/sessions/{sid}/feedback",
        files={
            "labelmap": ("edited.nii.gz", nifti_gz_bytes()),
            "prompt_log": ("log.json", json.dumps([{"type": "point", "x": 1}]).encode()),
            "original": ("orig.nii.gz", nifti_gz_bytes()),
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    names = {Path(e["path"]).name for e in body["stored"]}
    assert names == {"prompt_log.json", "edited_labelmap.nii.gz", "original.nii.gz"}
    for e in body["stored"]:
        assert e["bytes"] > 0
        assert Path(e["path"]).exists()


async def test_feedback_rejects_bad_prompt_log(client):
    sid = await new_session(client)
    r = await client.post(
        f"/v1/sessions/{sid}/feedback",
        files={
            "labelmap": ("edited.nii.gz", b"data"),
            "prompt_log": ("log.json", b"not json"),
        },
    )
    assert r.status_code == 400


async def test_feedback_rejects_non_nifti(client):
    sid = await new_session(client)
    r = await client.post(
        f"/v1/sessions/{sid}/feedback",
        files={"labelmap": ("edited.txt", b"data"), "prompt_log": ("log.json", b"{}")},
    )
    assert r.status_code == 400


# --- jobs ---


async def test_job_lifecycle_endpoints(client):
    sid = await new_session(client)
    r = await client.post("/v1/jobs", json={"session_id": sid, "kind": "auto", "model": "vista3d"})
    assert r.status_code == 201, r.text
    job = r.json()
    assert job["status"] == "queued"
    r = await client.get(f"/v1/jobs/{job['id']}")
    assert r.status_code == 200
    r = await client.get("/v1/jobs", params={"session_id": sid})
    assert len(r.json()) == 1


async def test_job_rejects_bad_kind(client):
    sid = await new_session(client)
    r = await client.post("/v1/jobs", json={"session_id": sid, "kind": "bogus", "model": "vista3d"})
    assert r.status_code == 422


async def test_job_404_unknown_session(client):
    r = await client.post("/v1/jobs", json={"session_id": str(uuid.uuid4()), "kind": "auto", "model": "vista3d"})
    assert r.status_code == 404


# --- queue claim ---


async def test_claim_uses_skip_locked_on_postgres():
    from app.services.queue import CLAIM_SQL_PG

    sql = str(CLAIM_SQL_PG)
    assert "FOR UPDATE SKIP LOCKED" in sql


async def test_claim_single_worker_fifo(client):
    # create jobs via API then claim both through the override session
    sid = await new_session(client)
    ids = []
    for _ in range(2):
        r = await client.post("/v1/jobs", json={"session_id": sid, "kind": "auto", "model": "nv_segment_ct"})
        ids.append(r.json()["id"])
    from app.db import get_db
    from app.services import queue

    gen = app_dependency_session()
    db = await gen.__anext__()
    j1 = await queue.claim_next(db)
    assert j1 is not None
    assert str(uuid.UUID(str(j1.id))) == str(uuid.UUID(ids[0])) and j1.status == "running"
    j2 = await queue.claim_next(db)
    assert j2 is not None
    assert str(uuid.UUID(str(j2.id))) == str(uuid.UUID(ids[1]))
    assert await queue.claim_next(db) is None  # drained
    assert (await queue.queue_depth(db)) == 0


async def app_dependency_session():
    from app.main import app
    from app.db import get_db

    dep = app.dependency_overrides[get_db]
    async for s in dep():
        yield s


# --- mock runner ---


async def test_mock_runner_writes_zero_labelmap(client, tmp_path):
    sid = await new_session(client)
    data = nifti_gz_bytes()
    await client.post(f"/v1/sessions/{sid}/volume", files={"file": ("scan.nii.gz", data)})

    from app.models import SegJob
    from app.services.runner import MockRunner
    from app.services.store import session_dir

    job = SegJob(session_id=uuid.UUID(sid), kind="auto", model="vista3d")
    out = await MockRunner().run(job, session_dir(sid))
    img = nib.load(out)
    import numpy as np

    assert img.shape == (4, 4, 4)
    assert np.all(nib.load(out).get_fdata() == 0)


def job_stub():
    from app.models import SegJob

    return SegJob(session_id=uuid.uuid4(), kind="auto", model="vista3d")


# --- health ---


async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["db"] is True

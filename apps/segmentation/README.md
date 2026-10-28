# docdo-segmentation

FastAPI service for 3D medical image segmentation (Vista3D / NVSegmentCT). Part of DocDo-ERP, Python-only, **not** an npm workspace.

## Endpoints (prefix `/v1`)

- `POST /v1/sessions` — create session (returns id)
- `POST /v1/sessions/{id}/volume` — upload NIfTI (`.nii`/`.nii.gz`, cap `SEG_MAX_UPLOAD_BYTES`, default 2 GB)
- `GET  /v1/sessions/{id}/volume` — download volume
- `GET  /v1/sessions/{id}/labelmap` — download latest labelmap
- `POST /v1/sessions/{id}/feedback` — multipart: `labelmap` NIfTI + `prompt_log` JSON + optional `original` NIfTI; stored under `{session}/feedback/`
- `POST /v1/jobs` — enqueue `{session_id, kind: auto|interactive, model: vista3d|nv_segment_ct, params?}`
- `GET  /v1/jobs/{id}` — job status
- `GET  /v1/jobs?session_id=` — list jobs
- `GET  /health` — db + store status
- `GET  /metrics` — Prometheus text (incl. `seg_queue_depth`)

## Config (env)

| Var | Default |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://localhost/docdo` |
| `SEG_STORE_DIR` | `/tmp/seg-store` |
| `SEG_TTL_HOURS` | `24` |
| `SEG_MAX_UPLOAD_BYTES` | `2147483648` |
| `SEG_RUNNER` | `mock` (`mock|monai`) |
| `SEG_MODEL_DIR` | `./models` (MONAI bundle cache; not baked into image) |
| `SEG_EMBED_CACHE` | `4` (interactive Vista3D embedding LRU entries) |

`SEG_RUNNER=monai` needs the extra stack: `pip install --extra-index-url https://download.pytorch.org/whl/cpu -e ".[monai]"`.
Interactive jobs (`kind: interactive`) are Vista3D-only and require `params.points` (`[{x,y,z,pos?}]`, voxel indices; `pos` default true) and optional `params.label`; invalid params → 400 at enqueue.

## Run

```sh
uv sync            # or pip install -e . && pip install pytest httpx aiosqlite
alembic upgrade head
uvicorn app.main:app --port 8000
```

## Tests

```sh
pytest
```

Uses sqlite+aiosqlite in-memory; queue claim tested by behavior (single worker) and by SQL containing `FOR UPDATE SKIP LOCKED` on postgres dialect.

## Export OpenAPI

```sh
python -c "from app.export import main; main()"
```

Writes `openapi.json` next to this README (for frontend client generation).

# syntax=docker/dockerfile:1
FROM --platform=linux/amd64 python:3.11-slim AS builder
WORKDIR /build
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir build && python -m build --wheel --outdir /dist .

FROM --platform=linux/amd64 python:3.11-slim
WORKDIR /srv
ENV PYTHONUNBUFFERED=1
# torch first from the CPU wheel index to keep the image lean (GPU variant: swap index later)
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu \
    "torch>=2.4" "monai>=1.4" nibabel einops "pytorch-ignite>=0.4.11" \
    && rm -rf /root/.cache/pip
COPY --from=builder /dist/*.whl .
RUN pip install --no-cache-dir greenlet ./*.whl && rm ./*.whl
COPY alembic.ini ./
COPY alembic ./alembic
# Model bundles are NOT baked in: downloaded at first use into SEG_MODEL_DIR (mount a volume).
ENV SEG_MODEL_DIR=/srv/models
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]

#!/usr/bin/env bash
# Backup do DocDo: dump do Postgres + pasta de arquivos (que já está cifrada com STORAGE_KEY).
# Uso: scripts/backup.sh [pasta-destino]   (padrão ./backups; mantém os últimos KEEP backups, padrão 14)
# Guarde a STORAGE_KEY em outro lugar: sem ela, os arquivos do backup não podem ser lidos.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; [ -f apps/api/.env ] && . ./apps/api/.env; set +a
# os arquivos (cifrados) ficam com a API
STORAGE_DIR="apps/api/${STORAGE_DIR:-./storage}"

DEST="${1:-./backups}"
KEEP="${KEEP:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DEST/docdo-$STAMP"
mkdir -p "$OUT"

# pg_dump do próprio contêiner (mesma versão do servidor); fora do Docker, use pg_dump "$MIGRATE_DATABASE_URL"
if docker ps --format '{{.Names}}' | grep -qx docdo-v5-db; then
  docker exec docdo-v5-db pg_dump -U "${POSTGRES_USER:-docdo}" -d "${POSTGRES_DB:-docdo}" --format=custom --no-owner > "$OUT/db.dump"
else
  pg_dump "$MIGRATE_DATABASE_URL" --format=custom --no-owner > "$OUT/db.dump"
fi
tar -czf "$OUT/storage.tar.gz" -C "$STORAGE_DIR" --exclude dev-outbox.jsonl .
( cd "$OUT" && shasum -a 256 db.dump storage.tar.gz > SHA256SUMS )
echo "Backup em $OUT ($(du -sh "$OUT" | cut -f1))"

# retenção
ls -1dt "$DEST"/docdo-* 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -rf

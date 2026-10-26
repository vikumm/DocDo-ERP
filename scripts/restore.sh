#!/usr/bin/env bash
# Restaura um backup gerado por scripts/backup.sh.
# Uso: scripts/restore.sh <pasta-do-backup> [nome-do-banco-destino]
# Sem o segundo argumento, SOBRESCREVE o banco configurado e a pasta de arquivos (pede confirmação).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; [ -f apps/api/.env ] && . ./apps/api/.env; set +a
# os arquivos (cifrados) ficam com a API
STORAGE_DIR="apps/api/${STORAGE_DIR:-./storage}"

SRC="${1:?informe a pasta do backup}"
TARGET_DB="${2:-${POSTGRES_DB:-docdo}}"
( cd "$SRC" && shasum -a 256 -c SHA256SUMS )

if [ -z "${2:-}" ]; then
  read -r -p "Isto apaga o banco '$TARGET_DB' e a pasta $STORAGE_DIR. Digite RESTAURAR para seguir: " ok
  [ "$ok" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }
fi

docker exec docdo-v5-db psql -U "${POSTGRES_USER:-docdo}" -d postgres -qc "DROP DATABASE IF EXISTS \"$TARGET_DB\" WITH (FORCE);" -c "CREATE DATABASE \"$TARGET_DB\";"
docker exec -i docdo-v5-db pg_restore -U "${POSTGRES_USER:-docdo}" -d "$TARGET_DB" --no-owner < "$SRC/db.dump"

if [ -z "${2:-}" ]; then
  rm -rf "$STORAGE_DIR" && mkdir -p "$STORAGE_DIR"
  tar -xzf "$SRC/storage.tar.gz" -C "$STORAGE_DIR"
fi
echo "Restaurado em '$TARGET_DB'."

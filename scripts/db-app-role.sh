#!/usr/bin/env bash
# Ativa o papel docdo_app (criado sem senha pela migração de RLS) com a senha de apps/api/.env.
# Em produção, o DBA faz o mesmo com a senha guardada no cofre de segredos.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; [ -f apps/api/.env ] && . ./apps/api/.env; set +a
: "${APP_DB_PASSWORD:?defina APP_DB_PASSWORD em apps/api/.env}"
docker exec -i docdo-v5-db psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-docdo}" -d "${POSTGRES_DB:-docdo}" -q \
  -v pw="$APP_DB_PASSWORD" <<'SQL'
ALTER ROLE docdo_app WITH LOGIN PASSWORD :'pw' NOSUPERUSER NOBYPASSRLS;
SQL
echo "Papel docdo_app ativo (sem superusuário, sujeito a RLS)."

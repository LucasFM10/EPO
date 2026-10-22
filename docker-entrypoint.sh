#!/bin/sh
# Aplica as migrations do banco antes de iniciar a aplicação.
# Única instância: não há concorrência de migrations.
set -eu

echo "[entrypoint] DATA_DIR=${DATA_DIR:-/app/data}"
node scripts/migrate.mjs

exec "$@"

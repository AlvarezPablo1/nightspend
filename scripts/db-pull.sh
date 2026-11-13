#!/usr/bin/env bash
# Reemplaza la base local (Docker) con una copia de la de producción.
#   npm run db:pull
# En producción solo lee. Antes guarda la base local en data/backups/ (no se sube al repo).
# Para volver atrás:
#   docker exec -i gastos-db pg_restore -U gastos -d gastos --clean --if-exists --no-owner --single-transaction < data/backups/<archivo>.dump
set -euo pipefail

CONTAINER=gastos-db
LOCAL_USER=gastos
LOCAL_DB=gastos
# Neon usa una versión más nueva que la base local, y pg_dump no lee servidores más nuevos que él.
# Este contenedor temporal comparte la red de gastos-db, así que ve la base local en localhost.
PG_TOOLS=(docker run --rm -i --network "container:$CONTAINER" postgres:18-alpine)

cd "$(dirname "$0")/.."

if ! docker exec "$CONTAINER" true 2>/dev/null; then
  echo "La base local no está corriendo. Levantala con: docker compose up -d" >&2
  exit 1
fi

env_file=$(mktemp)
remote_dump=$(mktemp)
trap 'rm -f "$env_file" "$remote_dump"' EXIT

echo "→ Leyendo la conexión de producción desde Vercel…"
vercel env pull "$env_file" --environment=production --yes >/dev/null 2>&1 || {
  echo "No se pudo leer Vercel. Revisá que estés logueado (vercel login) y que el proyecto esté vinculado (vercel link)." >&2
  exit 1
}
# Conexión directa (sin pooler): pg_dump la necesita.
remote_url=$(sed -nE 's/^DATABASE_URL_UNPOOLED="?([^"]*)"?$/\1/p' "$env_file")
if [ -z "$remote_url" ]; then
  echo "Falta DATABASE_URL_UNPOOLED en las variables de producción." >&2
  exit 1
fi

mkdir -p data/backups
backup="data/backups/local-$(date +%Y%m%d-%H%M%S).dump"
echo "→ Guardando la base local en ${backup}…"
docker exec "$CONTAINER" pg_dump -U "$LOCAL_USER" -Fc "$LOCAL_DB" > "$backup"

echo "→ Bajando la base de producción…"
# La conexión va por la entrada estándar para que no quede a la vista en la lista de procesos.
printf '%s\n' "$remote_url" | "${PG_TOOLS[@]}" sh -c 'read -r url; pg_dump -Fc --no-owner --no-privileges "$url"' > "$remote_dump"

echo "→ Cargándola en la base local…"
"${PG_TOOLS[@]}" pg_restore -h localhost -U "$LOCAL_USER" -d "$LOCAL_DB" --clean --if-exists --no-owner --no-privileges --single-transaction < "$remote_dump"

echo "✓ Listo. La base local ahora es una copia de producción."

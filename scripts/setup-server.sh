#!/usr/bin/env bash
# One command from a VPS with the code checked out to a running site. Installs what is missing (Postgres, Redis,
# ffmpeg, pm2), creates the database role and database, fixes the env files (one DATABASE_URL, in .env, pointing at
# Postgres), copies the old SQLite data the first time, then runs the normal deploy (pull, build, migrate, reload,
# health check). Safe to run again any time: it only changes what is missing or wrong.
#
#   sudo /srv/fcc/app/scripts/setup-server.sh
#
# The database password is made once and kept in .env; later runs reuse it.
set -euo pipefail
APP_USER="${APP_USER:-fcc}"
APP_DIR="${APP_DIR:-/srv/fcc/app}"
DB_NAME="${DB_NAME:-forevercomiccon}"
DB_USER="${DB_USER:-fcc}"
[ "$(id -u)" = 0 ] || { echo "run it as root: sudo $0"; exit 1; }
log() { printf '\n\033[1;33m▶ %s\033[0m\n' "$*"; }
as_app() { sudo -u "$APP_USER" -H env PATH="$PATH" "$@"; }
cd "$APP_DIR"

log "packages"
export DEBIAN_FRONTEND=noninteractive
need=(); for p in postgresql redis-server ffmpeg; do dpkg -s "$p" >/dev/null 2>&1 || need+=("$p"); done
if [ ${#need[@]} -gt 0 ]; then apt-get update -qq; apt-get install -y -qq "${need[@]}"; fi
systemctl enable --now postgresql redis-server >/dev/null
command -v node >/dev/null || { echo "✗ node is not installed"; exit 1; }
if ! command -v pm2 >/dev/null; then npm i -g pm2 >/dev/null; pm2 startup systemd -u "$APP_USER" --hp "/srv/$APP_USER" >/dev/null 2>&1 || true; fi

log "database password"
touch .env; chown "$APP_USER" .env; chmod 600 .env
url="$(grep -E '^DATABASE_URL=["'"'"']?postgres' .env | head -1 | cut -d= -f2- | tr -d '"'"'" || true)"
if [ -n "$url" ]; then
  pw="$(printf '%s' "$url" | sed -E 's#^postgres(ql)?://[^:]+:([^@]+)@.*#\2#')"
  echo "using the password already in .env"
else
  pw="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)"
  url="postgres://$DB_USER:$pw@127.0.0.1:5432/$DB_NAME"
  echo "made a new password; it is kept in $APP_DIR/.env"
fi

log "postgres role and database"
if sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='$DB_USER'" | grep -q 1; then
  sudo -u postgres psql -qc "alter user $DB_USER with password '$pw';"
else
  sudo -u postgres psql -qc "create user $DB_USER with password '$pw';"
fi
sudo -u postgres psql -tAc "select 1 from pg_database where datname='$DB_NAME'" | grep -q 1 || sudo -u postgres psql -qc "create database $DB_NAME owner $DB_USER;"

log "env files"
# Next reads .env.local ahead of .env: a stale DATABASE_URL anywhere else would send the build to the old SQLite file
for f in .env.local .env.production .env.production.local; do [ -f "$f" ] && sed -i '/^DATABASE_URL=/d;/^REDIS_URL=/d;/^WEB_CONCURRENCY=/d' "$f"; done
sed -i '/^DATABASE_URL=/d;/^REDIS_URL=/d' .env
cpus="$(nproc)"; workers=$(( cpus > 1 ? cpus - 1 : 1 ))   # leave one CPU for Postgres, Redis and the proxy
grep -q '^WEB_CONCURRENCY=' .env || echo "WEB_CONCURRENCY=$workers" >> .env
printf 'DATABASE_URL=%s\nREDIS_URL=redis://127.0.0.1:6379\n' "$url" >> .env
chown "$APP_USER" .env
grep -E '^(DATABASE_URL|REDIS_URL|WEB_CONCURRENCY)=' .env | sed -E 's#(postgres://[^:]+:)[^@]+@#\1…@#'

log "code"
as_app git pull --ff-only
as_app npm ci --no-audit --no-fund >/dev/null

log "data"
sqlite="$(ls -1 data/*.db 2>/dev/null | head -1 || true)"
has_users="$(sudo -u postgres psql -tAc "select count(*) from information_schema.tables where table_schema='public' and table_name='users'" "$DB_NAME")"
users=0; [ "$has_users" = 1 ] && users="$(sudo -u postgres psql -tAc "select count(*) from users" "$DB_NAME")"
if [ -n "$sqlite" ] && [ "$users" = 0 ]; then
  echo "Postgres is empty and $sqlite exists: copying it (the site is stopped while it copies)"
  as_app pm2 stop fcc >/dev/null 2>&1 || true
  as_app npm run -s db:copy -- "$sqlite"
else
  echo "nothing to copy ($users users already in Postgres)"
fi

# a process first started in fork mode keeps that mode on reload: start the cluster fresh
if as_app pm2 describe fcc 2>/dev/null | grep -q 'fork_mode'; then as_app pm2 delete fcc >/dev/null; fi

log "deploy (build, migrate, start the workers, health check)"
exec "$APP_DIR/scripts/deploy.sh" --no-pull

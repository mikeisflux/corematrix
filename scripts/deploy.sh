#!/usr/bin/env bash
# Pull, install, build, migrate and reload the app under pm2.
#   sudo -u fcc /srv/fcc/app/scripts/deploy.sh            # normal deploy
#   sudo -u fcc /srv/fcc/app/scripts/deploy.sh --seed     # also (re)seed the demo floor
#   sudo -u fcc /srv/fcc/app/scripts/deploy.sh --no-pull  # rebuild what is checked out
# Safe to run as root too: it re-executes itself as the app user.
set -euo pipefail

APP_USER="${APP_USER:-fcc}"
APP_DIR="${APP_DIR:-/srv/fcc/app}"
PORT="${PORT:-3000}"
PULL=1; SEED=0
for a in "$@"; do case "$a" in --no-pull) PULL=0;; --seed) SEED=1;; *) echo "unknown flag $a"; exit 2;; esac; done

if [ "$(id -un)" != "$APP_USER" ]; then
  exec sudo -u "$APP_USER" -H env APP_DIR="$APP_DIR" PORT="$PORT" "$APP_DIR/scripts/deploy.sh" "$@"
fi
export HOME="${HOME:-/srv/$APP_USER}"
export PATH="$PATH:/usr/local/bin:/usr/bin"
cd "$APP_DIR"
mkdir -p "$HOME/logs" data
log() { printf '\n\033[1;33m▶ %s\033[0m\n' "$*"; }

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
BEFORE="$(git rev-parse --short HEAD)"
if [ "$PULL" = 1 ]; then
  log "git pull ($BRANCH)"
  git fetch origin "$BRANCH"
  git pull --ff-only origin "$BRANCH"
fi
AFTER="$(git rev-parse --short HEAD)"
log "deploying $BEFORE → $AFTER on $BRANCH"

if ! command -v pm2 >/dev/null; then
  log "pm2 not found; install it once as root: npm i -g pm2 && pm2 startup systemd -u $APP_USER --hp $HOME"
  exit 1
fi

log "npm ci"
npm ci --no-audit --no-fund

log "next build"
npm run build

if [ "$SEED" = 1 ]; then log "seed"; npm run seed -- --force; fi

# Migrations run automatically when the app boots (ensureMigrated); nothing to do here.
log "pm2 reload"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save >/dev/null

log "health check"
for i in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)"
  if [ "$code" = "200" ]; then echo "OK http://127.0.0.1:$PORT/ → 200 ($AFTER)"; exit 0; fi
  sleep 2
done
echo "app did not answer 200 within 60s; last logs:"; pm2 logs fcc --lines 40 --nostream
exit 1

#!/usr/bin/env bash
# Deploy without disturbing the running site.
#
# The release is installed and built in a sibling folder ($APP_DIR.build) while the live server keeps serving from the
# old build untouched. The finished .next and node_modules are then swapped into place with two renames, pm2 reloads,
# and the new build is health-checked; if it fails, the previous build is swapped back and reloaded. Building in place
# used to leave the live server reading a half-replaced .next for a minute or two: visitors saw "This page couldn't
# load" on any page it hadn't loaded yet.
#
#   sudo -u fcc /srv/fcc/app/scripts/deploy.sh            # normal deploy
#   sudo -u fcc /srv/fcc/app/scripts/deploy.sh --no-pull  # rebuild what is checked out
# Safe to run as root too: it re-executes itself as the app user.
set -euo pipefail

APP_USER="${APP_USER:-fcc}"
APP_DIR="${APP_DIR:-/srv/fcc/app}"
BUILD_DIR="${BUILD_DIR:-$APP_DIR.build}"
PORT="${PORT:-3000}"
PM2="${PM2:-pm2}"
PULL=1
for a in "$@"; do case "$a" in --no-pull) PULL=0;; *) echo "unknown flag $a"; exit 2;; esac; done

if [ "$(id -un)" != "$APP_USER" ]; then
  exec sudo -u "$APP_USER" -H env APP_DIR="$APP_DIR" BUILD_DIR="$BUILD_DIR" PORT="$PORT" PM2="$PM2" "$APP_DIR/scripts/deploy.sh" "$@"
fi
main() {
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

if ! command -v "$PM2" >/dev/null; then
  log "pm2 not found; install it once as root: npm i -g pm2 && pm2 startup systemd -u $APP_USER --hp $HOME"
  exit 1
fi

healthy() {
  local p code
  for p in / /app /api/hall; do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT$p" || true)"
    [ "$code" = "200" ] || return 1
  done
}
wait_healthy() { local i; for i in $(seq 1 30); do if healthy; then return 0; fi; sleep 2; done; return 1; }
reload() { "$PM2" startOrReload ecosystem.config.cjs --update-env; "$PM2" save >/dev/null 2>&1 || true; }

# A build that dies with no message (the kernel's out-of-memory killer, usually) must say so, and say that the live
# site was not touched: the staged build never reaches the swap.
build_failed() {
  echo
  echo "✗ the staged build failed (exit $1); the live site was not touched and is still serving the previous build."
  echo "  If there was no error above, the build was most likely killed for memory: run  dmesg -T | grep -i 'killed process'"
  echo "  and  free -h . The staging folder is left at $BUILD_DIR."
  exit "$1"
}

log "staging the release in $BUILD_DIR"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
git archive HEAD | tar -x -C "$BUILD_DIR"                       # the committed sources, nothing else
for f in .env .env.local .env.production .env.production.local; do [ -f "$f" ] && cp "$f" "$BUILD_DIR/$f"; done
# The build prerenders the home page from the database. A relative file: URL in the env files would point inside the
# build folder, so hand the build the live file's absolute path (an exported variable wins over the env files).
if [ -z "${DATABASE_URL:-}" ]; then
  url="$( { cat .env.production.local .env.local .env.production .env 2>/dev/null || true; } | grep '^DATABASE_URL=' | head -1 | cut -d= -f2- | tr -d '"'"'"'"' || true)"
  case "$url" in file:/*) export DATABASE_URL="$url";; file:*) rel="${url#file:}"; rel="${rel#./}"; export DATABASE_URL="file:$APP_DIR/$rel";; esac
fi
if [ -d .next/cache ]; then mkdir -p "$BUILD_DIR/.next"; cp -r .next/cache "$BUILD_DIR/.next/cache"; fi   # minutes off the build

log "npm ci (staged)"
(cd "$BUILD_DIR" && npm ci --no-audit --no-fund) || build_failed $?

log "next build (staged)"
# The build peaks near 3.2 GB; on a 4 GB box the kernel killed it three times while other things held memory. Refuse to
# start it with less than 2.5 GB free (RAM plus swap) rather than let it die without a word, and keep V8's heap under
# what the box has so it collects garbage before the kernel collects the process.
avail_mb=$(awk '/MemAvailable|SwapFree/ { s += $2 } END { print int(s / 1024) }' /proc/meminfo)
if [ "${avail_mb:-0}" -lt 2500 ]; then
  echo "✗ only ${avail_mb} MB free (RAM + swap); the build needs about 3.2 GB. Stop or wait out whatever is using memory"
  echo "  (an ffmpeg encode: sudo -u $APP_USER pm2 logs fcc --lines 5; a stray build: pgrep -af next-build) and run this again."
  echo "  The live site was not touched."; exit 1
fi
(cd "$BUILD_DIR" && NODE_OPTIONS="--max-old-space-size=2560 ${NODE_OPTIONS:-}" npm run build) || build_failed $?

# Migrations run automatically when the app boots (ensureMigrated); nothing to do here.
log "swapping the build in"
rm -rf .next.prev node_modules.prev .next.failed
[ -d .next ] && mv .next .next.prev
[ -d node_modules ] && mv node_modules node_modules.prev
mv "$BUILD_DIR/.next" .next
mv "$BUILD_DIR/node_modules" node_modules
rm -rf "$BUILD_DIR"

log "pm2 reload"
reload

log "health check"
if wait_healthy; then
  echo "OK http://127.0.0.1:$PORT/ /app /api/hall → 200 ($AFTER)"
  rm -rf .next.prev node_modules.prev
  exit 0
fi

echo "the new build did not answer 200 on /, /app and /api/hall within 60s; last logs:"
"$PM2" logs fcc --lines 40 --nostream || true
if [ -d .next.prev ]; then
  log "rolling back to the previous build ($BEFORE)"
  mv .next .next.failed
  mv .next.prev .next
  if [ -d node_modules.prev ]; then rm -rf node_modules.failed; mv node_modules node_modules.failed; mv node_modules.prev node_modules; fi
  reload
  if wait_healthy; then echo "rolled back: the previous build is serving again. The failed build is in .next.failed for a look."; else echo "rollback did not come up healthy either; check pm2 logs fcc"; fi
fi
exit 1
}
main "$@"

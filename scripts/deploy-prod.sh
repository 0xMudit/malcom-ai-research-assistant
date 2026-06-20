#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-malcom-ai}"
PM2_HOME_DIR="${PM2_HOME_DIR:-/root/.pm2}"
PROD_DIST="${PROD_DIST:-.next}"
TIMESTAMP="$(date +%Y%m%d%H%M%S)"
BUILD_WORK_DIR="${BUILD_WORK_DIR:-.deploy-work-${TIMESTAMP}}"
BUILD_DIST="${BUILD_WORK_DIR}/.next"
BACKUP_DIST="${BACKUP_DIST:-.next-rollback-${TIMESTAMP}}"
LOCK_FILE="${LOCK_FILE:-/tmp/malcom-ai-deploy.lock}"
SOURCE_DIR="$(pwd)"

rollback_needed=0

cleanup() {
  local status=$?

  if [[ "$status" -ne 0 && "$rollback_needed" -eq 1 && -d "$BACKUP_DIST" ]]; then
    echo "Deploy failed. Rolling back to previous production build..."
    rm -rf "$PROD_DIST"
    mv "$BACKUP_DIST" "$PROD_DIST"
    sudo PM2_HOME="$PM2_HOME_DIR" pm2 restart "$APP_NAME" --update-env
  fi

  rm -rf "$BUILD_WORK_DIR"
  exit "$status"
}

trap cleanup EXIT

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another production deploy is already running."
  exit 1
fi

rm -rf "$BUILD_WORK_DIR"
npm run lint

mkdir -p "$BUILD_WORK_DIR"
rsync -a --delete \
  --exclude=".deploy-work-*/" \
  --exclude=".deploy-probe-*/" \
  --exclude=".git/" \
  --exclude=".next/" \
  --exclude=".next-build-*/" \
  --exclude=".next-dev/" \
  --exclude=".next-rollback-*/" \
  --exclude="mobile-audit/" \
  --exclude="node_modules/" \
  --exclude="test-results/" \
  "$SOURCE_DIR/" "$BUILD_WORK_DIR/"

cp -al "$SOURCE_DIR/node_modules" "$BUILD_WORK_DIR/node_modules"

(
  cd "$BUILD_WORK_DIR"
  npm run build
)

if [[ -d "$PROD_DIST/static" ]]; then
  echo "Preserving previously published static assets..."
  mkdir -p "$BUILD_DIST/static"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --ignore-existing "$PROD_DIST/static/" "$BUILD_DIST/static/"
  else
    cp -a -n "$PROD_DIST/static/." "$BUILD_DIST/static/"
  fi
fi

node scripts/verify-build-assets.mjs "$BUILD_DIST"
sudo nginx -t

echo "Activating verified build..."
sudo PM2_HOME="$PM2_HOME_DIR" pm2 stop "$APP_NAME"
rollback_needed=1
rm -rf "$BACKUP_DIST"
if [[ -d "$PROD_DIST" ]]; then
  mv "$PROD_DIST" "$BACKUP_DIST"
fi
mv "$BUILD_DIST" "$PROD_DIST"
sudo PM2_HOME="$PM2_HOME_DIR" pm2 restart "$APP_NAME" --update-env
node scripts/smoke.mjs "$@"
rollback_needed=0
rm -rf "$BACKUP_DIST"

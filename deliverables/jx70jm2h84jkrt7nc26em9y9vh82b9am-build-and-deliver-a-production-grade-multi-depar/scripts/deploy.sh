#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${1:-$ROOT_DIR/deployments}"
RELEASES_DIR="$DEPLOY_DIR/releases"
BACKUP_DIR="$DEPLOY_DIR/backups"
STAMP="$(date +%Y%m%d_%H%M%S)"
NEW_RELEASE="$RELEASES_DIR/$STAMP"
DEPLOY_BASENAME="$(basename "$DEPLOY_DIR")"

mkdir -p "$RELEASES_DIR" "$BACKUP_DIR"
mkdir -p "$NEW_RELEASE"

if [ -L "$DEPLOY_DIR/current" ]; then
  readlink "$DEPLOY_DIR/current" > "$DEPLOY_DIR/previous_release.txt"
fi

for entry in "$ROOT_DIR"/* "$ROOT_DIR"/.[!.]* "$ROOT_DIR"/..?*; do
  [ -e "$entry" ] || continue
  base="$(basename "$entry")"
  case "$base" in
    .|..|.git|.venv|.pydeps|.pytest_cache|__pycache__|deploy*|"${DEPLOY_BASENAME}")
      continue
      ;;
  esac
  cp -R "$entry" "$NEW_RELEASE/"
done

if [ -f "$ROOT_DIR/instance/workforce.db" ]; then
  cp "$ROOT_DIR/instance/workforce.db" "$BACKUP_DIR/workforce_${STAMP}.db"
fi

ln -sfn "$NEW_RELEASE" "$DEPLOY_DIR/current"
echo "$NEW_RELEASE" > "$DEPLOY_DIR/current_release.txt"

echo "Deployed release: $NEW_RELEASE"
echo "Current symlink: $DEPLOY_DIR/current"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${1:-$ROOT_DIR/deployments}"
PREVIOUS_FILE="$DEPLOY_DIR/previous_release.txt"
CURRENT_LINK="$DEPLOY_DIR/current"

if [ ! -f "$PREVIOUS_FILE" ]; then
  echo "No previous release recorded. Rollback aborted."
  exit 1
fi

PREVIOUS_RELEASE="$(cat "$PREVIOUS_FILE")"
if [ ! -d "$PREVIOUS_RELEASE" ]; then
  echo "Previous release path missing: $PREVIOUS_RELEASE"
  exit 1
fi

CURRENT_TARGET=""
if [ -L "$CURRENT_LINK" ]; then
  CURRENT_TARGET="$(readlink "$CURRENT_LINK")"
fi

ln -sfn "$PREVIOUS_RELEASE" "$CURRENT_LINK"

if [ -n "$CURRENT_TARGET" ]; then
  echo "$CURRENT_TARGET" > "$PREVIOUS_FILE"
fi

echo "Rollback complete. Current now points to: $PREVIOUS_RELEASE"

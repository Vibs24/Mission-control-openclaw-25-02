#!/bin/zsh
set -euo pipefail

ROOT="/Users/syphaoffice1/Mission-control-openclaw-25:02"
LIFE_DIR="$ROOT/life"
MEMORY_DIR="$ROOT/memory"
AGENTS_DIR="$ROOT/Mission-control/agents"
QMD_NPM_PACKAGE="@tobilu/qmd"

if command -v qmd >/dev/null 2>&1; then
  QMD_BIN="$(command -v qmd)"
elif [[ -x "/opt/homebrew/bin/qmd" ]]; then
  QMD_BIN="/opt/homebrew/bin/qmd"
else
  if command -v npm >/dev/null 2>&1; then
    echo "[install-qmd] qmd not found. Installing $QMD_NPM_PACKAGE via npm..."
    npm install -g "$QMD_NPM_PACKAGE"
    QMD_BIN="$(command -v qmd || true)"
  else
    echo "[install-qmd] ERROR: qmd not found and npm unavailable." >&2
    exit 1
  fi
fi

if [[ -z "${QMD_BIN:-}" || ! -x "$QMD_BIN" ]]; then
  echo "[install-qmd] ERROR: qmd installation failed or binary not executable." >&2
  exit 1
fi

echo "[install-qmd] Using qmd binary: $QMD_BIN"

resolve_link() {
  local source="$1"
  while [[ -L "$source" ]]; do
    local dir
    dir="$(cd -P "$(dirname "$source")" && pwd)"
    source="$(readlink "$source")"
    [[ "$source" != /* ]] && source="$dir/$source"
  done
  echo "$source"
}

QMD_REAL_BIN="$(resolve_link "$QMD_BIN")"
QMD_BIN_DIR="$(cd -P "$(dirname "$QMD_REAL_BIN")" && pwd)"
if [[ -x "$QMD_BIN_DIR/node" ]]; then
  export PATH="$QMD_BIN_DIR:$PATH"
  export QMD_NODE_BIN="$QMD_BIN_DIR/node"
fi

add_collection() {
  local name="$1"
  local dir="$2"
  local mask="$3"
  if [[ ! -d "$dir" ]]; then
    echo "[install-qmd] Skipping collection '$name' (missing dir: $dir)"
    return 0
  fi
  if "$QMD_BIN" collection list 2>/dev/null | awk '{print $1}' | grep -Fxq "$name"; then
    echo "[install-qmd] Collection exists: $name"
    return 0
  fi
  "$QMD_BIN" collection add "$dir" --name "$name" --mask "$mask"
  echo "[install-qmd] Added collection: $name"
}

add_collection "life" "$LIFE_DIR" "**/*.md"
add_collection "memory" "$MEMORY_DIR" "**/*.md"
add_collection "agents" "$AGENTS_DIR" "**/*.md"

"$QMD_BIN" update || true

echo "[install-qmd] QMD setup complete."

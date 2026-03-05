#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
"$DIR/scripts/setup.sh"
echo "Deployment ready. Start with: $DIR/scripts/run.sh"

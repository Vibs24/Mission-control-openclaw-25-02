#!/usr/bin/env bash
set -euo pipefail
source /tmp/workforce-venv/bin/activate
pytest -q

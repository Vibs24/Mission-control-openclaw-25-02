#!/usr/bin/env bash
set -euo pipefail
source /tmp/retailops-venv-jx7cn/bin/activate
export PYTHONPATH=.
pytest -q

# Smoke Config Sync Validation

## Scope
Validate OpenClaw profile sync and strict startup routing behavior.

## Checks Performed
1. `openclaw status`
2. `openclaw gateway status`
3. Verified service env/profile/config alignment from gateway status output.
4. Verified routing posture (loopback bind and local-only probe target).

## Results
- **Profile sync:** PASS
  - Service env uses profile `mc2`.
  - Config path matches between CLI and service (`~/.openclaw-mc2/openclaw.json`).
- **Strict startup routing:** PASS
  - Gateway bind is loopback `127.0.0.1`.
  - Probe target is `ws://127.0.0.1:19889` (local-only routing).
- **Additional findings:** WARN
  - LaunchAgent loaded but runtime shown as stopped/spawn scheduled.
  - Service PATH in LaunchAgent flagged as out-of-date/non-standard.

## Self-review + reproducibility
- Re-ran status commands and persisted raw outputs in this folder.
- Confirmed evidence files contain command outputs and can be rechecked with the same CLI commands.

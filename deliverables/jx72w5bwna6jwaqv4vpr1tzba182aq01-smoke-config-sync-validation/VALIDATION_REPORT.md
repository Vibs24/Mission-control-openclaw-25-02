# Smoke Config Sync Validation Report

## Scope
Validate OpenClaw profile sync and strict startup routing behavior.

## Checks Executed
1. `openclaw status`
2. `openclaw gateway status`
3. `openclaw --profile main gateway status`
4. `openclaw --profile main status`
5. Filesystem profile snapshot (`~/.openclaw*`, workspace `.openclaw-home`)

## Results
- ✅ CLI reachable (`openclaw --version` = `2026.2.25`)
- ✅ Gateway endpoint resolvable on loopback (`ws://127.0.0.1:19889`, RPC probe ok)
- ⚠️ Gateway service is **loaded but stopped** (state spawn scheduled)
- ⚠️ Service config flagged as non-standard/out-of-date (PATH warnings)
- ❌ Strict startup routing/profile isolation check failed:
  - `openclaw --profile main gateway status` still reports service env `OPENCLAW_PROFILE=mc2`
  - Indicates runtime/service route not strictly pinned to requested `main` profile

## Reproducible Evidence
See:
- `repro_profile_mismatch.txt`
- `repro_default_profile.txt`
- `cli_validation.txt`
- `profile_fs_snapshot.txt`

## Suggested Fix Path (not applied in this smoke run)
1. Run profile-specific doctor repair (`openclaw --profile main doctor --repair`).
2. Reinstall/restart launch agent for the intended profile.
3. Re-run the above 5 checks and confirm service env/profile alignment.

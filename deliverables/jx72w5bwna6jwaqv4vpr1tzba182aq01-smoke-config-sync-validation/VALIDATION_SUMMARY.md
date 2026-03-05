# Smoke Config Sync Validation

## Scope
Validate OpenClaw profile sync and strict startup routing wiring.

## Checks Run
1. `openclaw status`
2. `openclaw gateway status`
3. Static verification of startup routing hooks:
   - `ops/bin/start-missioncontrol-bot.sh`
   - `Mission-control/orchestrator/index.mjs`
   - `Mission-control/orchestrator/scripts/migrate-role-routing.mjs`
4. Config extract from `~/.openclaw-mc2/openclaw.json`
5. `openclaw --profile mc2 doctor`

## Results
- **Profile sync wiring: PASS (config-level)**
  - Active profile/config path resolves to `~/.openclaw-mc2/openclaw.json`.
  - Gateway service env points to same profile/config path.
  - Agent/default workspace + model defaults are present and readable.
- **Strict startup routing wiring: PASS (code-level)**
  - Startup script invokes role-agent provisioning and role-routing migration before orchestrator boot.
  - Orchestrator contains strict-routing guard that disables fallback-to-main on unknown agent.
  - PM workflow strict-routing block paths are present.
- **Operational health: WARN**
  - Gateway service reported loaded but stopped/spawn-scheduled during check.
  - Doctor reports state/security hygiene issues (permissions, PATH drift, multi-state dirs).

## Self-review actions
- Re-ran checks after evidence capture; outputs remained consistent.
- No code change required for this smoke validation task; findings are reproducible from captured files.

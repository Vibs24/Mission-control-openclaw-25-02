#!/bin/zsh
set -euo pipefail

ROOT="/Users/syphaoffice1/Mission-control-openclaw-25:02"
LAUNCH_DIR="$HOME/Library/LaunchAgents"
UID_NUM="$(id -u)"
mkdir -p "$LAUNCH_DIR"

bootstrap_or_verify() {
  local label="$1"
  local plist="$2"
  if ! /bin/launchctl bootstrap "gui/$UID_NUM" "$plist" >/dev/null 2>&1; then
    /bin/launchctl print "gui/$UID_NUM/$label" >/dev/null 2>&1 || {
      echo "Failed to bootstrap $label from $plist" >&2
      return 1
    }
  fi
}

install -m 0644 "$ROOT/ops/launchd/ai.missioncontrol.bot.plist" "$LAUNCH_DIR/ai.missioncontrol.bot.plist"
install -m 0644 "$ROOT/ops/launchd/ai.missioncontrol.dashboard.plist" "$LAUNCH_DIR/ai.missioncontrol.dashboard.plist"
install -m 0644 "$ROOT/ops/launchd/ai.missioncontrol.agent-sync.plist" "$LAUNCH_DIR/ai.missioncontrol.agent-sync.plist"
install -m 0644 "$ROOT/ops/launchd/ai.missioncontrol.pkm-extract.plist" "$LAUNCH_DIR/ai.missioncontrol.pkm-extract.plist"
install -m 0644 "$ROOT/ops/launchd/ai.missioncontrol.pkm-synthesis.plist" "$LAUNCH_DIR/ai.missioncontrol.pkm-synthesis.plist"

for label in ai.missioncontrol.bot ai.missioncontrol.dashboard ai.missioncontrol.agent-sync ai.missioncontrol.pkm-extract ai.missioncontrol.pkm-synthesis; do
  /bin/launchctl bootout "gui/$UID_NUM/$label" >/dev/null 2>&1 || true
done
sleep 1

bootstrap_or_verify ai.missioncontrol.bot "$LAUNCH_DIR/ai.missioncontrol.bot.plist"
bootstrap_or_verify ai.missioncontrol.dashboard "$LAUNCH_DIR/ai.missioncontrol.dashboard.plist"
bootstrap_or_verify ai.missioncontrol.agent-sync "$LAUNCH_DIR/ai.missioncontrol.agent-sync.plist"
bootstrap_or_verify ai.missioncontrol.pkm-extract "$LAUNCH_DIR/ai.missioncontrol.pkm-extract.plist"
bootstrap_or_verify ai.missioncontrol.pkm-synthesis "$LAUNCH_DIR/ai.missioncontrol.pkm-synthesis.plist"
/bin/launchctl enable "gui/$UID_NUM/ai.missioncontrol.bot"
/bin/launchctl enable "gui/$UID_NUM/ai.missioncontrol.dashboard"
/bin/launchctl enable "gui/$UID_NUM/ai.missioncontrol.agent-sync"
/bin/launchctl enable "gui/$UID_NUM/ai.missioncontrol.pkm-extract"
/bin/launchctl enable "gui/$UID_NUM/ai.missioncontrol.pkm-synthesis"
/bin/launchctl kickstart -k "gui/$UID_NUM/ai.missioncontrol.bot"
/bin/launchctl kickstart -k "gui/$UID_NUM/ai.missioncontrol.dashboard"
/bin/launchctl kickstart -k "gui/$UID_NUM/ai.missioncontrol.agent-sync"
/bin/launchctl kickstart -k "gui/$UID_NUM/ai.missioncontrol.pkm-extract"
/bin/launchctl kickstart -k "gui/$UID_NUM/ai.missioncontrol.pkm-synthesis"

echo "Installed and started: ai.missioncontrol.bot, ai.missioncontrol.dashboard, ai.missioncontrol.agent-sync, ai.missioncontrol.pkm-extract, ai.missioncontrol.pkm-synthesis"

#!/usr/bin/env bash
# Start the reporter agent in LOCAL SIMULATION mode.
#
# Runs the compiled Compact circuits in process: real commitments, real
# nullifiers, real duplicate rejection, real threshold. No proof, no
# transaction, no chain, no wallet — so it needs nothing from the faucet.
#
# The agent reports `simulated: true` on /api/status and the UI shows a banner
# saying so. Nothing produced in this mode should ever be presented as testnet.
set -uo pipefail

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

export CHORUS_NETWORK=local
export CHORUS_AGENT_PORT="${CHORUS_AGENT_PORT:-3001}"

cd "$HOME/chorus"
exec npm run agent --workspace @chorus/cli

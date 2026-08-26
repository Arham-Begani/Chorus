#!/usr/bin/env bash
# Start the Chorus reporter agent against a testnet.
#
# Non-interactive on purpose: the agent has to come up unattended and stay up
# while the UI is open and the video is being captured.
#
# Wallet seed resolution, in order:
#   1. $CHORUS_WALLET_SEED, if already set
#   2. the wallet created during M0, if that file exists
#   3. nothing — the agent will refuse to start and say so
#
# Reusing an already-funded wallet is what avoids the faucet captcha on every
# run. The faucet is Cloudflare-Turnstile-gated and cannot be scripted.
set -uo pipefail

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

export CHORUS_NETWORK="${CHORUS_NETWORK:-preview}"
export DEBUG_LEVEL="${DEBUG_LEVEL:-debug}"

M0_WALLET="$HOME/chorus-m0/.m0/wallet-${CHORUS_NETWORK}.txt"

if [ -z "${CHORUS_WALLET_SEED:-}" ] && [ -f "$M0_WALLET" ]; then
  # Format: "Your wallet seed is: <64 hex> and your address is: ..."
  CHORUS_WALLET_SEED=$(sed -n 's/.*seed is: \([0-9a-f]\{64\}\).*/\1/p' "$M0_WALLET")
  export CHORUS_WALLET_SEED
fi

if [ -z "${CHORUS_WALLET_SEED:-}" ]; then
  echo "No wallet seed. Set CHORUS_WALLET_SEED to 64 hex characters." >&2
  exit 1
fi

echo "network: $CHORUS_NETWORK"
echo "seed:    ${CHORUS_WALLET_SEED:0:8}... (${#CHORUS_WALLET_SEED} chars)"

cd "$HOME/chorus"
exec npm run agent --workspace @chorus/cli

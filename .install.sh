#!/usr/bin/env bash
# Detached workspace install.
#
# Run via `setsid` so it survives the parent shell being killed — this install
# takes far longer than any single tool invocation, and losing it halfway means
# starting the slow filesystem writes again.
set -euo pipefail

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd /mnt/d/GitHub/Chorus

echo "node: $(node -v)  npm: $(npm -v)"
echo "started: $(date -Is)"

npm install \
  --cache /mnt/d/GitHub/Chorus/.npm-cache \
  --prefer-offline \
  --no-audit \
  --no-fund

echo "finished: $(date -Is)"
echo "DONE"

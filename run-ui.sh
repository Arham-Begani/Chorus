#!/usr/bin/env bash
# Start the Vite dev server for the Chorus UI.
#
# Binds all interfaces because the server runs inside WSL while the browser
# (and the Playwright capture) run on Windows. WSL2 forwards localhost for
# IPv4, but binding explicitly avoids the cases where it does not.
set -uo pipefail

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$HOME/chorus"
exec npm run dev --workspace @chorus/ui -- --host 0.0.0.0 --port 5173 --strictPort

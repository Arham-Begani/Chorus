#!/usr/bin/env bash
# Mirror the repo from D: into the WSL native filesystem, then run a command there.
#
# WHY THIS EXISTS: npm install into /mnt/d (the Windows drive, over 9p) is
# pathologically slow — 45+ minutes and three killed runs, versus 8 minutes on
# native ext4. So the repo on D: stays the source of truth and the editable
# copy, and ~/chorus is a disposable build/run mirror.
#
# node_modules deliberately lives ONLY in the mirror. Nothing generated is
# copied back except by explicit choice (see sync-back below).
#
# ui/public is excluded as a DIRECTORY, not as the one file inside it. The
# deploy writes ui/public/deployment.json into the mirror and it exists nowhere
# on D:, so excluding just the file left rsync trying to --delete a directory
# whose only occupant was protected — which fails the whole run under `set -e`.
#
#   ./sync.sh                      # just mirror
#   ./sync.sh npm run build        # mirror, then run a command in the mirror
set -euo pipefail

SRC=/mnt/d/GitHub/Chorus
DEST="$HOME/chorus"

mkdir -p "$DEST"

rsync -a --delete \
  --exclude 'node_modules' \
  --exclude '.npm-cache' \
  --exclude '.tools' \
  --exclude 'dist' \
  --exclude '.vite' \
  --exclude '.git' \
  --exclude 'video/out' \
  --exclude 'video/capture' \
  --exclude 'cli/logs' \
  --exclude '*.log' \
  --exclude 'ui/public/' \
  "$SRC/" "$DEST/"

if [ "$#" -gt 0 ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  cd "$DEST"
  exec "$@"
fi

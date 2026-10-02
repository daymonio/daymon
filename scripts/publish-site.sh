#!/bin/bash
# Publish https://daymon.io/ — the site is served from the shared server, not from GitHub Pages
# (moved 2026-10-02). Run after the change is merged.
set -euo pipefail
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
HOST="${SITE_HOST:-appadmin@49.13.88.157}"
KEY="${SITE_KEY:-$HOME/.ssh/tracker-heroku-exit}"
DEST="/opt/selectic-heroku-exit/sites/daymon.io/"
# research/ and assets/ hold pages GitHub used to render from Markdown; keep them as they are.
rsync -az --delete --exclude CNAME --exclude research/ --exclude assets/ \
  -e "ssh -i $KEY -o BatchMode=yes" docs/ "$HOST:$DEST"
echo "published: https://daymon.io/"

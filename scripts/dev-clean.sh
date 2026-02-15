#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ELECTRON_BIN="$ROOT_DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
MCP_SERVER="$ROOT_DIR/out/mcp/server.js"
MAIN_BUNDLE="$ROOT_DIR/out/main/index.js"

# Kill only Daymon-related processes for this repo, not every Electron app.
KILLED=false
for pattern in "$ELECTRON_BIN" "$MCP_SERVER" "$MAIN_BUNDLE"; do
  if pkill -f "$pattern" 2>/dev/null; then
    KILLED=true
  fi
done

# Wait for processes to actually exit before starting new ones.
if [ "$KILLED" = true ]; then
  sleep 1
fi

# Remove stale Chromium singleton lock files so requestSingleInstanceLock() works.
APP_DATA="${XDG_CONFIG_HOME:-$HOME/Library/Application Support}/daymon"
rm -f "$APP_DATA/SingletonLock" "$APP_DATA/SingletonSocket" "$APP_DATA/SingletonCookie" 2>/dev/null || true

exit 0

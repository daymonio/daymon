#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ELECTRON_BIN="$ROOT_DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
MCP_SERVER="$ROOT_DIR/out/mcp/server.js"
MAIN_BUNDLE="$ROOT_DIR/out/main/index.js"

# Kill only Daymon-related processes for this repo, not every Electron app.
pkill -f "$ELECTRON_BIN" 2>/dev/null || true
pkill -f "$MCP_SERVER" 2>/dev/null || true
pkill -f "$MAIN_BUNDLE" 2>/dev/null || true
pkill -f "electron-vite dev.*$ROOT_DIR" 2>/dev/null || true

exit 0

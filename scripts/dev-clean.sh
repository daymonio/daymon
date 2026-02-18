#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Kill electron-vite FIRST (it respawns Electron if left alive), then Electron processes.
pkill -9 -f "electron-vite dev" 2>/dev/null || true
pkill -9 -f "$ROOT_DIR/node_modules/electron/dist" 2>/dev/null || true
sleep 1

# Remove stale Chromium singleton lock files (covers both "daymon" and "Daymon" casing).
# macOS
for APP_DATA in "$HOME/Library/Application Support/daymon" "$HOME/Library/Application Support/Daymon"; do
  rm -f "$APP_DATA/SingletonLock" "$APP_DATA/SingletonSocket" "$APP_DATA/SingletonCookie" 2>/dev/null || true
done
# Linux
for APP_DATA in "$HOME/.config/daymon" "$HOME/.config/Daymon"; do
  rm -f "$APP_DATA/SingletonLock" "$APP_DATA/SingletonSocket" "$APP_DATA/SingletonCookie" 2>/dev/null || true
done

exit 0

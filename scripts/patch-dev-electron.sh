#!/bin/bash
# Patch the dev Electron.app binary to show "Daymon" instead of "Electron"
# in macOS notifications, permission dialogs, and Activity Monitor.
# This runs after npm install and only affects the local dev binary.
# macOS-only — skips gracefully on other platforms.

set -euo pipefail

if [ "$(uname)" != "Darwin" ]; then
  exit 0
fi

ELECTRON_APP="node_modules/electron/dist/Electron.app"
PLIST="$ELECTRON_APP/Contents/Info.plist"
ICNS_SRC="build/icon.icns"
ICNS_DIR="$ELECTRON_APP/Contents/Resources"

if [ ! -f "$PLIST" ]; then
  echo "patch-dev-electron: Electron.app not found, skipping"
  exit 0
fi

# Patch Info.plist: change "Electron" → "Daymon"
plutil -replace CFBundleName -string "Daymon" "$PLIST"
plutil -replace CFBundleDisplayName -string "Daymon" "$PLIST"
plutil -replace CFBundleIdentifier -string "io.daymon.app" "$PLIST"

# Add a hardlink named "Daymon" so macOS Accessibility shows the right name.
# The original "Electron" binary stays intact for electron-vite compatibility.
MACOS_DIR="$ELECTRON_APP/Contents/MacOS"
if [ -f "$MACOS_DIR/Electron" ] && [ ! -f "$MACOS_DIR/Daymon" ]; then
  ln "$MACOS_DIR/Electron" "$MACOS_DIR/Daymon"
fi
plutil -replace CFBundleExecutable -string "Daymon" "$PLIST"

# Copy pre-built icon (checked into repo at build/icon.icns)
if [ -f "$ICNS_SRC" ]; then
  cp "$ICNS_SRC" "$ICNS_DIR/daymon.icns"
  plutil -replace CFBundleIconFile -string "daymon" "$PLIST"
else
  echo "patch-dev-electron: Warning: build/icon.icns not found, icon not patched"
fi

# Clear macOS icon cache for the patched app
touch "$ELECTRON_APP"

echo "patch-dev-electron: Patched to show 'Daymon' in dev mode"

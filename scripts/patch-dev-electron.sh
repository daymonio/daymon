#!/bin/bash
# Patch the dev Electron.app binary to show "Daymon" instead of "Electron"
# in macOS notifications, permission dialogs, and Activity Monitor.
# This runs after npm install and only affects the local dev binary.

ELECTRON_APP="node_modules/electron/dist/Electron.app"
PLIST="$ELECTRON_APP/Contents/Info.plist"
ICON_SRC="resources/icon.png"
ICNS_SRC="build/icon.icns"
ICNS_DIR="$ELECTRON_APP/Contents/Resources"

if [ ! -f "$PLIST" ]; then
  echo "patch-dev-electron: Electron.app not found, skipping"
  exit 0
fi

# Patch Info.plist: change "Electron" → "Daymon"
plutil -replace CFBundleName -string "Daymon" "$PLIST" 2>/dev/null
plutil -replace CFBundleDisplayName -string "Daymon" "$PLIST" 2>/dev/null
plutil -replace CFBundleIdentifier -string "io.daymon.app" "$PLIST" 2>/dev/null

# Prefer the production icns asset so dev/prod show the exact same app icon.
if [ -f "$ICNS_SRC" ]; then
  cp "$ICNS_SRC" "$ICNS_DIR/daymon.icns"
  plutil -replace CFBundleIconFile -string "daymon" "$PLIST" 2>/dev/null

# Fallback: generate icns from PNG if build/icon.icns is unavailable.
elif [ -f "$ICON_SRC" ]; then
  ICONSET=$(mktemp -d)/icon.iconset
  mkdir -p "$ICONSET"
  sips -z 16 16 "$ICON_SRC" --out "$ICONSET/icon_16x16.png" >/dev/null 2>&1
  sips -z 32 32 "$ICON_SRC" --out "$ICONSET/icon_16x16@2x.png" >/dev/null 2>&1
  sips -z 32 32 "$ICON_SRC" --out "$ICONSET/icon_32x32.png" >/dev/null 2>&1
  sips -z 64 64 "$ICON_SRC" --out "$ICONSET/icon_32x32@2x.png" >/dev/null 2>&1
  sips -z 128 128 "$ICON_SRC" --out "$ICONSET/icon_128x128.png" >/dev/null 2>&1
  sips -z 256 256 "$ICON_SRC" --out "$ICONSET/icon_128x128@2x.png" >/dev/null 2>&1
  sips -z 256 256 "$ICON_SRC" --out "$ICONSET/icon_256x256.png" >/dev/null 2>&1
  sips -z 512 512 "$ICON_SRC" --out "$ICONSET/icon_256x256@2x.png" >/dev/null 2>&1
  sips -z 512 512 "$ICON_SRC" --out "$ICONSET/icon_512x512.png" >/dev/null 2>&1
  cp "$ICON_SRC" "$ICONSET/icon_512x512@2x.png"
  iconutil -c icns "$ICONSET" -o "$ICNS_DIR/daymon.icns" 2>/dev/null
  rm -rf "$(dirname "$ICONSET")"

  plutil -replace CFBundleIconFile -string "daymon" "$PLIST" 2>/dev/null
fi

# Clear macOS icon cache for the patched app
touch "$ELECTRON_APP"

echo "patch-dev-electron: Patched to show 'Daymon' in dev mode"

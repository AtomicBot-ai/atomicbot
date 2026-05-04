#!/usr/bin/env bash
set -euo pipefail

# Build a styled DMG installer using appdmg (bypasses Finder/AppleScript entirely).
#
# Contains:
# - <App>.app (positioned on the left)
# - /Applications symlink (positioned on the right)
# - Custom background image
#
# Usage:
#   scripts/build-dmg-from-app.sh <app_path> <output_dmg>
#
# Env:
#   DMG_VOLUME_NAME   override volume name (defaults to CFBundleName)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

APP_PATH="${1:-}"
OUT_DMG="${2:-}"

if [[ -z "$APP_PATH" || -z "$OUT_DMG" ]]; then
  echo "Usage: $0 <app_path> <output_dmg>" >&2
  exit 1
fi
if [[ ! -d "$APP_PATH" ]]; then
  echo "Error: app bundle not found: $APP_PATH" >&2
  exit 1
fi

APP_NAME=$(/usr/libexec/PlistBuddy -c "Print CFBundleName" "$APP_PATH/Contents/Info.plist" 2>/dev/null || echo "Atomic Claw")
DMG_VOLUME_NAME="${DMG_VOLUME_NAME:-$APP_NAME}"

# Background image and icon for the DMG window
BG_IMAGE="$APP_DIR/assets/dmg-installer-bg.png"
ICON_FILE="$APP_DIR/assets/icon.icns"

if [[ ! -f "$BG_IMAGE" ]]; then
  echo "Warning: DMG background not found at $BG_IMAGE" >&2
fi

# Generate a temporary appdmg JSON config
TMP_CONFIG="$(mktemp /tmp/appdmg-config.XXXXXX.json)"
trap 'rm -f "$TMP_CONFIG"' EXIT

# appdmg writes .DS_Store at the binary level — no Finder/AppleScript needed.
cat > "$TMP_CONFIG" <<JSONEOF
{
  "title": "$DMG_VOLUME_NAME",
  "background": "$BG_IMAGE",
  "icon": "$ICON_FILE",
  "icon-size": 100,
  "window": {
    "size": { "width": 640, "height": 400 }
  },
  "contents": [
    { "x": 200, "y": 250, "type": "file", "path": "$APP_PATH" },
    { "x": 440, "y": 250, "type": "link", "path": "/Applications" },
    { "x": 9999, "y": 9999, "type": "position", "path": ".background" },
    { "x": 9999, "y": 9999, "type": "position", "path": ".VolumeIcon.icns" }
  ]
}
JSONEOF

rm -f "$OUT_DMG"

echo "[atomicbot] build-dmg-from-app: building styled DMG via appdmg"
npx appdmg "$TMP_CONFIG" "$OUT_DMG"

echo "[atomicbot] build-dmg-from-app: ready: $OUT_DMG"

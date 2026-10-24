#!/bin/sh
# Build and run Rinse. Usage:
#   scripts/run.sh mac               build and open the macOS app
#   scripts/run.sh ios [device-id]   build and install on a connected iPhone/iPad (unlock it first)
set -e
cd "$(dirname "$0")/.."
xcodegen generate -q

case "${1:-mac}" in
  mac)
    xcodebuild -scheme Rinse_macOS -destination 'platform=macOS' -derivedDataPath build -allowProvisioningUpdates -quiet build
    open build/Build/Products/Debug/Rinse.app
    ;;
  ios)
    DEVICE="${2:-$(xcrun devicectl list devices 2>/dev/null | awk '/available \(paired\)/ && /physical/ { for (i = 1; i <= NF; i++) if ($i ~ /^[0-9A-F]{8}-[0-9A-F]+$/) { print $i; exit } }')}"
    [ -n "$DEVICE" ] || { echo "No unlocked, paired iPhone/iPad found. Connect and unlock it, or pass its id."; exit 1; }
    xcodebuild -scheme Rinse_iOS -destination "id=$DEVICE" -derivedDataPath build -allowProvisioningUpdates -quiet build
    xcrun devicectl device install app --device "$DEVICE" build/Build/Products/Debug-iphoneos/Rinse.app
    xcrun devicectl device process launch --device "$DEVICE" com.nikolaikushner.rinse || true
    ;;
  *) echo "usage: $0 mac | ios [device-id]"; exit 1 ;;
esac

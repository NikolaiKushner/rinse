#!/bin/sh
# Archives Rinse for iOS and/or macOS and uploads it to App Store Connect (TestFlight).
# Usage: scripts/release.sh [ios|mac|all]
# Bump CURRENT_PROJECT_VERSION in project.yml before every upload: each build number is used once.
set -e
cd "$(dirname "$0")/.."
xcodegen generate -q
archives=build/archives; mkdir -p "$archives"
version=$(awk -F'"' '/MARKETING_VERSION/ {print $2; exit}' project.yml)
build=$(awk '/CURRENT_PROJECT_VERSION/ {print $2; exit}' project.yml)

upload() {  # scheme, destination, name
  archive="$archives/Rinse-$3-$version-$build.xcarchive"
  echo "== $3: archiving $version ($build)"
  xcodebuild -scheme "$1" -destination "$2" -configuration Release -archivePath "$archive" \
    -allowProvisioningUpdates -quiet archive
  echo "== $3: signing and uploading to App Store Connect"
  xcodebuild -exportArchive -archivePath "$archive" -exportOptionsPlist Config/ExportOptions.plist \
    -exportPath "$archives/export-$3" -allowProvisioningUpdates
}

case "${1:-all}" in
  ios) upload Rinse_iOS 'generic/platform=iOS' ios ;;
  mac) upload Rinse_macOS 'generic/platform=macOS' mac ;;
  all) upload Rinse_iOS 'generic/platform=iOS' ios; upload Rinse_macOS 'generic/platform=macOS' mac ;;
  *) echo "usage: $0 [ios|mac|all]"; exit 1 ;;
esac

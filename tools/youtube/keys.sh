#!/bin/sh
# Which pruned field makes YouTube stall the start? Runs each key set N times.
cd "$(dirname "$0")/../.."
id=$1; runs=${2:-4}
for keys in adPlacements adPlacements,adSlots adPlacements,adSlots,playerAds adPlacements,adSlots,playerAds,adBreakHeartbeatParams; do
  for i in $(seq 1 "$runs"); do
    printf "%-55s #%s  " "$keys" "$i"
    swift tools/youtube/try-youtube.swift "$id" --keys "$keys" --seconds 14 2>/dev/null | grep summary
  done
done

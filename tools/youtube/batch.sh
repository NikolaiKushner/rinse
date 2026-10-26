#!/bin/sh
# Runs try-youtube.swift N times per mode and prints one summary line per run.
# Usage: tools/youtube/batch.sh <videoId> <runs> [seconds]
cd "$(dirname "$0")/../.."
id=$1; runs=${2:-3}; secs=${3:-20}
for mode in --no-rinse --no-page full; do
  for i in $(seq 1 "$runs"); do
    flag=$mode; [ "$mode" = full ] && flag=""
    printf "%-10s #%s  " "$mode" "$i"
    swift tools/youtube/try-youtube.swift "$id" $flag --seconds "$secs" 2>/dev/null | grep summary
  done
done

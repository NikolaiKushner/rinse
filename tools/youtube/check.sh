#!/bin/sh
# Release check for the YouTube extension on Mac WebKit: several runs on videos known to show
# ads, with full Rinse and with only content.js (the fallback when page.js can't run).
# Look for: ad=0s with full Rinse, no longestStall above 1s, and opacity 0 whenever AD shows.
cd "$(dirname "$0")/../.."
runs=${1:-3}
for id in oufxWa84Fxk TN87Mzm6xSs nAchMctX4YA; do
  for mode in full --no-page; do
    for i in $(seq 1 "$runs"); do
      flag=$mode; [ "$mode" = full ] && flag=""
      out=$(swift tools/youtube/try-youtube.swift "$id" $flag --seconds 16 2>/dev/null)
      visible=$(echo "$out" | grep "AD " | grep -vc "opacity=0")
      printf "%s %-9s #%s  %s  ad-visible-frames=%s\n" "$id" "$mode" "$i" "$(echo "$out" | grep summary)" "$visible"
    done
  done
done

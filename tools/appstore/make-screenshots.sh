#!/bin/sh
# Builds App Store screenshots from docs/appstore/raw into docs/appstore/screenshots/<lang>/.
# Sizes: iPhone 6.9" 1320x2868, iPad 13" 2064x2752, Mac 2880x1800.
# Raw shots (any that are missing are skipped):
#   youtube-iphone.png, popup-iphone.png, youtube-mac.png, app-mac-<lang>.png  ← taken on real devices
#   web-phone-before/after.png, web-mac-before/after.png                       ← tools/filters/try-url.swift
#   app-iphone-<lang>.png, app-ipad-<lang>.png                                 ← simulator, -RinseScreenshots
set -e
cd "$(dirname "$0")/../.."
raw=docs/appstore/raw
frame() { swift tools/appstore/frame.swift "$@" >/dev/null; }

for lang in en ru; do
  out=docs/appstore/screenshots/$lang; mkdir -p "$out"
  if [ "$lang" = en ]; then
    t1="YouTube without ads";        s1="Ads cut out before they load"
    t2="Websites without the clutter"; s2="About 143,000 blocking rules"; labels="Without Rinse|With Rinse"
    t3="Off on any site in one tap"; s3="Right from Safari's extensions menu"
    t4="Set up in a minute";          s4="No account. Nothing collected."
  else
    t1="YouTube без рекламы";         s1="Реклама вырезается ещё до загрузки"
    t2="Сайты без лишнего";           s2="Около 143 000 правил блокировки"; labels="Без Rinse|С Rinse"
    t3="Выключается в одно касание";  s3="Прямо из меню расширений Safari"
    t4="Настройка за минуту";         s4="Без аккаунта и сбора данных"
  fi
  for device in iphone ipad mac; do
    case $device in iphone) size=1320x2868 ;; ipad) size=2064x2752 ;; mac) size=2880x1800 ;; esac
    web=phone; [ $device = mac ] && web=mac
    # iPad can reuse the iPhone's YouTube and popup shots when there are no iPad ones.
    for shot in youtube popup; do
      [ $device = ipad ] && [ ! -f $raw/$shot-ipad.png ] && [ -f $raw/$shot-iphone.png ] && cp $raw/$shot-iphone.png $raw/$shot-ipad.png
    done
    [ -f $raw/youtube-$device.png ] && frame --size $size --out $out/$device-1.png --title "$t1" --subtitle "$s1" --in $raw/youtube-$device.png
    [ -f $raw/web-$web-before.png ] && frame --size $size --out $out/$device-2.png --title "$t2" --subtitle "$s2" \
      --in $raw/web-$web-before.png --in $raw/web-$web-after.png --labels "$labels"
    [ -f $raw/popup-$device.png ] && frame --size $size --out $out/$device-3.png --title "$t3" --subtitle "$s3" --in $raw/popup-$device.png
    [ -f $raw/app-$device-$lang.png ] && frame --size $size --out $out/$device-4.png --title "$t4" --subtitle "$s4" --in $raw/app-$device-$lang.png
  done
done
find docs/appstore/screenshots -name '*.png' | sort

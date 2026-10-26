#!/bin/sh
# Builds App Store screenshots from docs/appstore/raw into docs/appstore/screenshots/<lang>/.
# Sizes: iPhone 6.9" 1320x2868, iPhone 6.3" 1206x2622 (App Store Connect's "medium display" slot),
# iPad 13" 2064x2752, Mac 2880x1800.
# Raw shots (any that are missing are skipped):
#   youtube-<device>-<lang>.png, popup-<device>-<lang>.png  ← drawn in docs/appstore/mocks/mock.html
#   web-phone-before/after.png, web-mac-before/after.png    ← real site via tools/filters/try-url.swift
#   app-iphone-<lang>.png, app-ipad-<lang>.png              ← simulator with -RinseScreenshots
#   app-mac-<lang>.png                                      ← Mac app window (optional)
# The video shot is a generic player on purpose: no YouTube logo or UI in App Store screenshots.
set -e
cd "$(dirname "$0")/../.."
raw=docs/appstore/raw
frame() { swift tools/appstore/frame.swift "$@" >/dev/null; }

for lang in en ru; do
  out=docs/appstore/screenshots/$lang; mkdir -p "$out"
  if [ "$lang" = en ]; then
    t1="Videos without ads";         s1="Ads cut out before they load"
    t2="Websites without the clutter"; s2="About 143,000 blocking rules"; labels="Without Rinse|With Rinse"
    t3="Off on any site in one tap"; t3mac="Off on any site in one click"; s3="Right from Safari's extensions menu"
    t4="Set up in a minute";          s4="No account. Nothing collected."
  else
    t1="Видео без рекламы";           s1="Реклама вырезается ещё до загрузки"
    t2="Сайты без лишнего";           s2="Около 143 000 правил блокировки"; labels="Без Rinse|С Rinse"
    t3="Выключается в одно касание";  t3mac="Выключается в один клик"; s3="Прямо из меню расширений Safari"
    t4="Настройка за минуту";         s4="Без аккаунта и сбора данных"
  fi
  for device in iphone iphone63 ipad mac; do
    case $device in iphone) size=1320x2868 ;; iphone63) size=1206x2622 ;; ipad) size=2064x2752 ;; mac) size=2880x1800 ;; esac
    web=phone; [ $device = mac ] && web=mac
    # iPad and the 6.3" set reuse the iPhone's shots.
    src=$device; [ $device = ipad ] || [ $device = iphone63 ] && src=iphone
    app=$device; [ $device = iphone63 ] && app=iphone
    [ -f $raw/youtube-$src-$lang.png ] && frame --size $size --out $out/$device-1.png --title "$t1" --subtitle "$s1" --in $raw/youtube-$src-$lang.png
    [ -f $raw/web-$web-before.png ] && frame --size $size --out $out/$device-2.png --title "$t2" --subtitle "$s2" \
      --in $raw/web-$web-before.png --in $raw/web-$web-after.png --labels "$labels"
    t3d=$t3; [ $device = mac ] && t3d=$t3mac
    [ -f $raw/popup-$src-$lang.png ] && frame --size $size --out $out/$device-3.png --title "$t3d" --subtitle "$s3" --in $raw/popup-$src-$lang.png
    [ -f $raw/app-$app-$lang.png ] && frame --size $size --out $out/$device-4.png --title "$t4" --subtitle "$s4" --in $raw/app-$app-$lang.png
  done
done
find docs/appstore/screenshots -name '*.png' | sort

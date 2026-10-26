#!/bin/sh
# Opens popular sites with and without Rinse's blockers and compares visible text and page height.
# A big drop in text with blockers on suggests a rule hides real content. Snapshots go to $1.
cd "$(dirname "$0")/../.."
out=${1:-/tmp/rinse-regression}; mkdir -p "$out"
for url in https://www.bbc.com/news https://edition.cnn.com https://www.nytimes.com https://www.reddit.com \
           https://www.amazon.com https://ru.wikipedia.org https://lenta.ru https://ria.ru \
           https://www.avito.ru https://www.ozon.ru https://github.com https://www.apple.com; do
  name=$(echo "$url" | sed -E 's#https?://##; s#[/.]#_#g')
  off=$(swift tools/filters/try-url.swift "$url" --no-blockers --wait 8 --snapshot "$out/$name-off.png" 2>/dev/null | grep blockers=)
  on=$(swift tools/filters/try-url.swift "$url" --wait 8 --snapshot "$out/$name-on.png" 2>/dev/null | grep blockers=)
  python3 - "$url" "$off" "$on" <<'PY'
import re, sys
url, off, on = sys.argv[1:]
def get(s, k):
    m = re.search(rf"{k}=(\d+)", s); return int(m.group(1)) if m else 0
t0, t1, h0, h1 = get(off, "text"), get(on, "text"), get(off, "height"), get(on, "height")
f0, f1 = get(off, "iframes"), get(on, "iframes")
ratio = t1 / t0 if t0 else 0
flag = "  ⚠︎ CHECK" if t0 and ratio < 0.85 else ""
print(f"{url:32} text {t0:>6} → {t1:>6} ({ratio:4.0%})  height {h0:>6} → {h1:>6}  iframes {f0} → {f1}{flag}")
PY
done

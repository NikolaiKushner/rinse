#!/usr/bin/env python3
"""Writes docs/appstore/gallery.html: every App Store screenshot, by language and device.

The page shows the JPEG previews in docs/appstore/previews and links each one to its full-size
PNG on GitHub. Captions mirror tools/appstore/make-screenshots.sh.
Usage: python3 tools/appstore/gallery.py
"""
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPO = "https://github.com/nikolaikushner/rinse/blob/main/docs/appstore/screenshots"

CAPTIONS = {
    "en": {1: "Videos without ads", 2: "Websites without the clutter", 3: "Off on any site in one tap",
           "3mac": "Off on any site in one click", 4: "Set up in a minute"},
    "ru": {1: "Видео без рекламы", 2: "Сайты без лишнего", 3: "Выключается в одно касание",
           "3mac": "Выключается в один клик", 4: "Настройка за минуту"},
}
DEVICES = [("iphone", "iPhone", "6.9″ · 1320 × 2868"), ("ipad", "iPad", "13″ · 2064 × 2752"), ("mac", "Mac", "2880 × 1800")]
UI = {
    "en": {"lang": "English", "lead": "Screenshots for the App Store, in the order to upload them.",
           "open": "Open full size", "source": "How they're made"},
    "ru": {"lang": "Русский", "lead": "Скриншоты для App Store в порядке загрузки.",
           "open": "Открыть в полном размере", "source": "Как они сделаны"},
}

sections = []
for lang in ("en", "ru"):
    groups = []
    for device, name, size in DEVICES:
        figures = []
        for n in range(1, 5):
            preview = ROOT / f"docs/appstore/previews/{lang}/{device}-{n}.jpg"
            if not preview.exists():
                continue
            caption = CAPTIONS[lang]["3mac" if (n == 3 and device == "mac") else n]
            figures.append(
                f'<figure><a href="{REPO}/{lang}/{device}-{n}.png" title="{escape(UI[lang]["open"])}">'
                f'<img src="previews/{lang}/{device}-{n}.jpg" alt="{escape(caption)}" loading="lazy"></a>'
                f'<figcaption><span class="n">{n}</span>{escape(caption)}</figcaption></figure>')
        groups.append(
            f'<section class="device {device}"><header><h2>{name}</h2><p>{size} · {len(figures)}</p></header>'
            f'<div class="shots">{"".join(figures)}</div></section>')
    sections.append(f'<div class="lang" id="{lang}" lang="{lang}"{" hidden" if lang == "ru" else ""}>'
                    f'<p class="lead">{escape(UI[lang]["lead"])}</p>{"".join(groups)}</div>')

page = f"""<title>Rinse App Store Screenshots</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@500;700;800&family=Golos+Text:wght@400;500&display=swap">
<style>
/* Layout: a store shelf. One band per device, screenshots in upload order, captions under each. */
:root {{
  --bg: #f3f8fb; --surface: #ffffff; --fg: #0d1b2a; --muted: #5b6b7c; --line: #dbe6ee;
  --teal: #0bc5d8; --blue: #0a6cf5; --chip: #e5f4fa;
  --display: "Onest", -apple-system, "Helvetica Neue", Arial, sans-serif;
  --body: "Golos Text", -apple-system, "Helvetica Neue", Arial, sans-serif;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
  --bg: #08131c; --surface: #0f1e2b; --fg: #e8f1f7; --muted: #93a6b6; --line: #1d3142; --chip: #12293a; color-scheme: dark; }} }}
:root[data-theme="dark"] {{ --bg: #08131c; --surface: #0f1e2b; --fg: #e8f1f7; --muted: #93a6b6; --line: #1d3142; --chip: #12293a; color-scheme: dark; }}
body {{ background: var(--bg); color: var(--fg); font: 15px/1.5 var(--body);
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }}
.wrap {{ max-width: 1180px; margin: 0 auto; padding-block: 32px 64px; }}
.top {{ display: flex; flex-wrap: wrap; align-items: center; gap: 16px 24px; }}
.brand {{ display: flex; align-items: center; gap: 14px; }}
.brand .icon {{ width: 52px; height: 52px; border-radius: 13px; background: linear-gradient(135deg, var(--teal), var(--blue));
  display: grid; place-items: center; box-shadow: 0 8px 24px rgba(10, 108, 245, .25); }}
.brand svg {{ width: 26px; height: 26px; }}
h1 {{ font: 800 clamp(26px, 4vw, 34px)/1.1 var(--display); letter-spacing: -.02em; margin: 0; text-wrap: balance; }}
.sub {{ color: var(--muted); margin: 2px 0 0; }}
.switch {{ margin-left: auto; display: flex; padding: 4px; border-radius: 999px; background: var(--chip); }}
.switch button {{ border: 0; background: transparent; color: var(--muted); font: 600 14px var(--body); padding: 8px 16px; border-radius: 999px; cursor: pointer; }}
.switch button[aria-pressed="true"] {{ background: var(--surface); color: var(--fg); box-shadow: 0 1px 4px rgba(0,0,0,.12); }}
.switch button:focus-visible {{ outline: 2px solid var(--blue); outline-offset: 2px; }}
.lead {{ color: var(--muted); margin: 28px 0 8px; }}
.device {{ margin-top: 28px; }}
.device header {{ display: flex; align-items: baseline; gap: 12px; border-bottom: 1px solid var(--line); padding-bottom: 8px; margin-bottom: 18px; }}
h2 {{ font: 700 20px var(--display); margin: 0; }}
.device header p {{ margin: 0; color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }}
.shots {{ display: grid; gap: 22px; }}
.iphone .shots {{ grid-template-columns: repeat(4, minmax(0, 1fr)); }}
.ipad .shots {{ grid-template-columns: repeat(4, minmax(0, 1fr)); }}
.mac .shots {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
figure {{ margin: 0; min-width: 0; }}
figure a {{ display: block; border-radius: 14px; overflow: hidden; background: var(--surface);
  box-shadow: 0 10px 30px rgba(13, 27, 42, .14); transition: transform .2s ease, box-shadow .2s ease; }}
figure a:hover {{ transform: translateY(-3px); box-shadow: 0 16px 36px rgba(13, 27, 42, .2); }}
figure a:focus-visible {{ outline: 3px solid var(--blue); outline-offset: 3px; }}
figure img {{ display: block; width: 100%; height: auto; }}
figcaption {{ display: flex; gap: 8px; align-items: baseline; margin-top: 10px; font-weight: 500; }}
.n {{ flex: none; font: 700 12px var(--display); color: var(--blue); background: var(--chip); border-radius: 6px; padding: 1px 7px; }}
footer {{ margin-top: 48px; color: var(--muted); font-size: 13px; }}
footer a {{ color: var(--blue); }}
@media (max-width: 860px) {{ .iphone .shots, .ipad .shots {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }} .mac .shots {{ grid-template-columns: 1fr; }} }}
@media (prefers-reduced-motion: reduce) {{ figure a {{ transition: none; }} figure a:hover {{ transform: none; }} }}
</style>
<div class="wrap">
  <div class="top">
    <div class="brand">
      <div class="icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="#fff" d="M12 2.5c3.6 4.4 6.2 7.9 6.2 11.2A6.2 6.2 0 0 1 12 19.9a6.2 6.2 0 0 1-6.2-6.2C5.8 10.4 8.4 6.9 12 2.5Z"/><path fill="#0a6cf5" d="M10.6 11.4v4.4l3.7-2.2z"/></svg></div>
      <div><h1>Rinse App Store Screenshots</h1><p class="sub">Rinse: Ad Blocker for Safari · 22 screenshots · iPhone, iPad, Mac</p></div>
    </div>
    <div class="switch" role="group" aria-label="Language">
      <button type="button" id="btn-en" aria-pressed="true">English</button>
      <button type="button" id="btn-ru" aria-pressed="false">Русский</button>
    </div>
  </div>
  {"".join(sections)}
  <footer>Full-size PNGs: <a href="https://github.com/nikolaikushner/rinse/tree/main/docs/appstore/screenshots">docs/appstore/screenshots</a>.
  Built by <code>tools/appstore/make-screenshots.sh</code>; the website shots come from a real page with and without Rinse, the video and menu are drawn mocks.</footer>
</div>
<script>
const show = (lang) => {{
  for (const l of ["en", "ru"]) {{
    document.getElementById(l).hidden = l !== lang;
    document.getElementById("btn-" + l).setAttribute("aria-pressed", String(l === lang));
  }}
  try {{ localStorage.setItem("lang", lang); }} catch {{}}
}};
document.getElementById("btn-en").onclick = () => show("en");
document.getElementById("btn-ru").onclick = () => show("ru");
let start = location.hash === "#ru" ? "ru" : location.hash === "#en" ? "en" : null;
try {{ start ??= localStorage.getItem("lang"); }} catch {{}}
show(start === "ru" ? "ru" : "en");
</script>
"""
(ROOT / "docs/appstore/gallery.html").write_text(page)
print("wrote docs/appstore/gallery.html")

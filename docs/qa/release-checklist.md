# Release checklist

Run before every App Store build. Automated checks first, then a few minutes by hand on each
device. Write the results under "Last run" at the bottom.

## Automated (Mac)

```sh
python3 -m unittest discover -s tools/filters                               # filter compiler
tools/tests/run-allowlist-tests.sh                                          # allowlist, incl. WebKit
for t in content-ads content-background late-injection; do node spikes/youtube-stream/test/$t.mjs; done
swift tools/filters/validate.swift Extensions/Blockers/*/blockerList.json   # WebKit accepts the rules
swift tools/filters/try-url.swift https://adblock.turtlecute.org/ --wait 30 --text | grep -o "Total.*not blocked"
tools/filters/regression.sh /tmp/rinse-regression                           # 12 sites, with vs without
tools/youtube/check.sh 3                                                    # YouTube on Mac WebKit
```

Pass when:
- all tests pass and WebKit compiles all three lists;
- turtlecute: at least 110 of 132 blocked (what's left is phone telemetry, which we skip on purpose);
- regression: no site flagged `⚠︎ CHECK`, or the snapshots show nothing real is missing
  (retry flagged sites with `--wait 20`: some just load slower);
- YouTube: `ad=0s` with full Rinse, and no stall without the "Ad skipped" note (`silentStall` ≤ 1s).

## By hand

### iPhone and iPad

- [ ] Fresh install: the app shows the setup steps and "Turn on N more extensions".
- [ ] After turning on all extensions and coming back, the header says "All set".
- [ ] App in Russian when the device is in Russian (Settings → Apps → Rinse → Language).
- [ ] iPad: the app is a centered column on a grey background, in portrait and landscape, and in Split View.
- [ ] YouTube (m.youtube.com on iPhone, desktop site on iPad): 5 videos, no ad seen.
- [ ] Background playback off: locking the screen pauses YouTube.
- [ ] Background playback on (app toggle, reload page): locking the screen keeps it playing.
- [ ] A news site (lenta.ru, bbc.com): no ad blocks, the page looks normal.
- [ ] aA → Rinse → "Turn off on this site": ads come back, the site shows up in the app. "Turn back on" removes it.

### Mac (Safari)

- [ ] Safari → Settings → Extensions: all four Rinse extensions on, no errors under Rinse for YouTube.
- [ ] The app shows "All set".
- [ ] YouTube: 5 videos, no ad seen, the player never looks frozen without the "Ad skipped" note.
- [ ] hdrezka.sh (or any mirror): no Leader-Bet / casino branding.
- [ ] Toolbar → Rinse popup → turn off on a site and back on.
- [ ] https://adblock.turtlecute.org/: about 110+ of 132 blocked.

## Last run

**2026-10-26, Mac WebKit (automated):**
- Tests: all pass. WebKit compiles Ads 75.7k, Privacy 56.3k, Page Cleaner 11k rules.
- turtlecute: **112 / 132** blocked (was 84 before the host additions in `filters/rinse.txt`).
  Not blocked: phone telemetry (Realme, Oppo, Apple, Xiaomi, Huawei) and error reporting, on purpose.
- Regression, 12 sites (BBC, CNN, NYT, Reddit, Amazon, Wikipedia, Lenta, RIA, Avito, Ozon,
  GitHub, Apple): no content lost. NYT flagged at 8s, fine at 20s (right column loads slower).
- iPad and Mac Safari by hand: not run yet.

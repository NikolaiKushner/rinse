# Rinse

Safari extensions for iPhone, iPad and Mac:

- **Rinse for YouTube** — removes ads from the YouTube player, adds Picture in Picture and background playback.
- **Rinse Ads**, **Rinse Privacy**, **Rinse Page Cleaner** — content blockers for ad networks, trackers and leftover ad slots on every site (EasyList, EasyPrivacy, RU AdList).

Plan: [plans/rinse.md](plans/rinse.md) · YouTube spike: [docs/spikes/youtube-streams.md](docs/spikes/youtube-streams.md)

## Run

Needs Xcode 27+ and `brew install xcodegen`. The project is generated from `project.yml`; `Rinse.xcodeproj` is not committed.

```sh
scripts/run.sh mac     # build and open the Mac app
scripts/run.sh ios     # build and install on the connected, unlocked iPhone/iPad
```

Or `xcodegen generate && open Rinse.xcodeproj` and run `Rinse_iOS` / `Rinse_macOS`.

### Update filter lists

```sh
scripts/update-filters.sh                                            # download + compile
python3 -m unittest discover -s tools/filters                        # compiler tests
swift tools/filters/validate.swift Extensions/Blockers/*/blockerList.json   # WebKit accepts the rules
```

If WebKit starts rejecting selectors, regenerate the reject list:
`python3 tools/filters/compile.py --dump-selectors /tmp/s.txt && swift tools/filters/check-selectors.swift /tmp/s.txt > filters/invalid-selectors.txt`

### Turn the extensions on

- **Mac:** Safari → Settings → Extensions → turn on all Rinse extensions. For *Rinse for YouTube*, allow it on youtube.com. Debug builds need Safari → Develop → *Allow Unsigned Extensions* only if the build is not signed with a team.
- **iPhone / iPad:** Settings → Apps → Safari → Extensions → turn on all of them, and allow *Rinse for YouTube* on youtube.com.

## Layout

| Path | What |
|---|---|
| `App/` | SwiftUI container app (status of extensions, how to enable) |
| `Shared/` | Code shared by the app targets |
| `Extensions/YouTube/` | Safari Web Extension: `Resources/content.js` injects `page.js`, which prunes ad payloads |
| `Extensions/Blockers/{Ads,Privacy,Cosmetic}/` | Content blockers; `blockerList.json` is generated, don't edit it |
| `filters/` | `sources.json` (which lists go into which blocker), `rinse.txt` (our own rules) |
| `tools/filters/` | Filter compiler, its tests, and WebKit-based validators |
| `scripts/` | `run.sh`, icon and blocklist generators |
| `spikes/` | Throwaway experiments, kept for reference |

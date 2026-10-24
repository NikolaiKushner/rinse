# Licenses

## Rinse code

Copyright © 2026 Nikolai Kushner. Licensed under the GNU General Public License v3.0, see [LICENSE](LICENSE).

The name "Rinse" and the Rinse icon (`App/Assets.xcassets/AppIcon.appiconset/`, `Extensions/YouTube/Resources/icon-*.png`, `scripts/make-icons.swift`) are not licensed under the GPL. Forks must use their own name and icon.

## Third-party filter lists

Rinse's content blockers are compiled from these lists (see `filters/sources.json`). Rules are
converted to Safari's format by `tools/filters/compile.py`; unsupported rules are dropped.

The compiled `Extensions/Blockers/*/blockerList.json` files are derived from these lists and stay under their licenses, with attribution.

| List | Source | License |
|---|---|---|
| EasyList | https://easylist.to | GPL-3.0 or CC BY-SA 3.0 (we use CC BY-SA 3.0) |
| EasyPrivacy | https://easylist.to | GPL-3.0 or CC BY-SA 3.0 (we use CC BY-SA 3.0) |
| RU AdList | https://forums.lanik.us/viewforum.php?f=102 | CC BY 3.0 |

Thanks to the EasyList and RU AdList authors and contributors.

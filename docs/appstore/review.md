# App Review and App Store Connect answers

## App Review Information → Notes

Paste as is (English):

```
Rinse is a set of Safari extensions with a small container app. There is no account and no sign-in.

HOW TO TEST (iPhone/iPad)
1. Open Settings → Apps → Safari → Extensions.
2. Turn on Rinse Ads, Rinse Privacy and Rinse Page Cleaner (content blockers).
3. Turn on Rinse for YouTube and allow it on youtube.com.
4. Open the Rinse app: the header shows "All set" once the extensions are on.
5. In Safari, open a news site such as https://www.bbc.com/news: ad slots are gone.
6. Open https://m.youtube.com and play a video: no ads before or during it.
7. On any site, tap aA → Rinse → "Turn off on this site": the page reloads with ads. "Turn back on" undoes it.

On Mac: Safari → Settings → Extensions → turn on the four Rinse extensions, and for Rinse for YouTube set youtube.com to Allow. The Rinse toolbar button offers the same per-site switch.

WHAT THE EXTENSIONS DO
- Rinse Ads, Rinse Privacy and Rinse Page Cleaner are standard content blockers. They hand Safari rule lists (EasyList, EasyPrivacy, RU AdList and our own rules) and never see the pages the user visits.
- Rinse for YouTube runs only on youtube.com. It removes ad data from the page so the player doesn't show ads, and can optionally keep a video playing when the user leaves Safari (off by default, a switch in the app). It doesn't download videos, doesn't change or collect any content, and doesn't access the user's YouTube account.
- The extension's toolbar popup uses activeTab: it reads the current tab's address only when the user opens it, to turn Rinse off or on for that site.

PRIVACY
Rinse collects no data and makes no network requests of its own. Settings are stored on device in an App Group shared by the app and its extensions. Privacy policy: https://nikolaikushner.github.io/rinse/privacy.html

Rinse is open source: https://github.com/nikolaikushner/rinse
```

Sign-in required: **No**.

## Age rating

Answer **None** / **No** to everything. Notes:
- Unrestricted Web Access: **No**. Rinse is not a browser; it only adds extensions to Safari.
- Result: **4+**.

## App Privacy

- Data collection: **No, we do not collect data from this app.** → "Data Not Collected".
- Privacy Policy URL: https://nikolaikushner.github.io/rinse/privacy.html

## Export compliance

`ITSAppUsesNonExemptEncryption = NO` is set in the app's Info.plist (project.yml), so App Store
Connect doesn't ask on every build. Rinse uses no encryption beyond what iOS/macOS provide.

## Pricing and availability

- Price: **$1.99** (Tier 2), all territories.
- Universal Purchase: iOS and macOS share bundle ID `com.nikolaikushner.rinse`, so one purchase covers both.
- Small Business Program: not applied yet (decided 2026-10-26; can be done any time, cuts the commission to 15%).

## Risks to be ready for

- **4.1 / 5.2 (third-party content, YouTube):** the notes above say plainly what Rinse for YouTube
  does and doesn't do. Comparable apps (Vinegar) are on the App Store. If rejected, answer in
  Resolution Center; as a fallback, ship without Rinse for YouTube and add it in an update.
- **2.3.7 (metadata):** no other companies' trademarks in name, subtitle or keywords
  (checked by `docs/appstore/check.py`).

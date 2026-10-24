#!/usr/bin/env python3
"""Generate the starter blockerList.json for the Rinse Ads content blocker.

A hand-picked list of major ad/tracker domains and generic ad selectors, so the
app is useful before the real EasyList compiler (plan step 4) lands.
Usage: python3 scripts/starter-blocklist.py > Extensions/Blockers/Ads/blockerList.json
"""
import json
import re

AD_DOMAINS = [
    # Google ads
    "doubleclick.net", "googlesyndication.com", "googleadservices.com", "adservice.google.com",
    "googletagservices.com", "2mdn.net", "imasdk.googleapis.com",
    # Exchanges / SSPs / DSPs
    "adnxs.com", "pubmatic.com", "rubiconproject.com", "openx.net", "criteo.com", "criteo.net",
    "casalemedia.com", "indexww.com", "advertising.com", "adsrvr.org", "smartadserver.com",
    "sharethrough.com", "teads.tv", "yieldmo.com", "3lift.com", "triplelift.com", "media.net",
    "amazon-adsystem.com", "adform.net", "bidswitch.net", "contextweb.com", "lijit.com",
    "sovrn.com", "33across.com", "gumgum.com", "spotxchange.com", "springserve.com",
    # Native ads
    "taboola.com", "outbrain.com", "revcontent.com", "mgid.com", "zergnet.com",
    # Verification / measurement
    "moatads.com", "doubleverify.com", "adsafeprotected.com", "scorecardresearch.com",
    # Popups / ad networks
    "popads.net", "propellerads.com", "adsterra.com", "exoclick.com", "juicyads.com",
    # RU segment
    "an.yandex.ru", "yandexadexchange.net", "adfox.ru", "adriver.ru", "begun.ru", "relap.io",
    "adhigh.net", "buzzoola.com", "otm-r.com", "betweendigital.com",
]

TRACKER_DOMAINS = [
    "google-analytics.com", "googletagmanager.com", "hotjar.com", "mc.yandex.ru",
    "top-fwz1.mail.ru", "counter.yadro.ru", "quantserve.com", "chartbeat.com", "newrelic.com",
    "bat.bing.com", "ads-twitter.com", "analytics.tiktok.com", "ads.linkedin.com",
]

# Same-origin YouTube ad and ad-telemetry endpoints.
YOUTUBE_PATHS = [
    r"youtube\.com/pagead/",
    r"youtube\.com/api/stats/ads",
    r"youtube\.com/get_midroll_",
    r"youtube\.com/ptracking",
]

GENERIC_HIDE = [
    "ins.adsbygoogle", ".adsbygoogle", "[id^='google_ads_iframe']", "div[id^='div-gpt-ad']",
    "[data-google-query-id]", ".trc_related_container", ".OUTBRAIN", "[id^='taboola-']",
    ".mgbox", "[class^='adfox']", "iframe[src*='doubleclick.net']",
    "iframe[src*='googlesyndication.com']",
]

YOUTUBE_HIDE = [
    "ytd-ad-slot-renderer", "ytd-in-feed-ad-layout-renderer", "ytd-banner-promo-renderer",
    "ytd-statement-banner-renderer", "#masthead-ad", "ytd-promoted-sparkles-web-renderer",
    "ytd-player-legacy-desktop-watch-ads-renderer", ".ytd-merch-shelf-renderer",
    "ytm-promoted-sparkles-web-renderer", "ad-slot-renderer", "ytm-companion-ad-renderer",
    "ytm-companion-slot",
]

# Kept in its own rule: one selector Safari rejects would drop every selector in the same rule.
YOUTUBE_HIDE_HAS = ["tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)"]


def host_filter(domain: str) -> str:
    # Matches the domain and any subdomain, any scheme. Safari's regex subset: no |, no {}.
    return r"^[^:]+://+([^:/]+\.)?" + re.escape(domain).replace(r"\-", "-") + r"[:/]"


def rules():
    out = []
    for d in AD_DOMAINS + TRACKER_DOMAINS:
        out.append({"trigger": {"url-filter": host_filter(d), "load-type": ["third-party"]},
                    "action": {"type": "block"}})
    for p in YOUTUBE_PATHS:
        out.append({"trigger": {"url-filter": r"^https?://([^/]+\.)?" + p},
                    "action": {"type": "block"}})
    out.append({"trigger": {"url-filter": ".*"},
                "action": {"type": "css-display-none", "selector": ", ".join(GENERIC_HIDE)}})
    out.append({"trigger": {"url-filter": ".*", "if-domain": ["*youtube.com"]},
                "action": {"type": "css-display-none", "selector": ", ".join(YOUTUBE_HIDE)}})
    out.append({"trigger": {"url-filter": ".*", "if-domain": ["*youtube.com"]},
                "action": {"type": "css-display-none", "selector": ", ".join(YOUTUBE_HIDE_HAS)}})
    return out


if __name__ == "__main__":
    print(json.dumps(rules(), indent=1))

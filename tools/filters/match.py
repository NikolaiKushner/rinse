#!/usr/bin/env python3
"""Would Rinse block this request? Evaluates the compiled Safari rules the way Safari does.

Matches url-filter (a Safari regex, which Python's re understands), resource-type, load-type,
if-domain/unless-domain, and lets later ignore-previous-rules exceptions cancel earlier blocks.
Close enough to Safari for "is this host covered at all?" questions.

Usage:
  python3 tools/filters/match.py https://ads.example.com/x.js [--type script] [--page https://site.com/]
  python3 tools/filters/match.py --hosts hosts.txt [--type raw] [--page https://site.com/]
"""
import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
BLOCKERS = ["Ads", "Privacy"]  # network blockers; Cosmetic only hides elements


def load_rules():
    rules = []
    for name in BLOCKERS:
        for rule in json.loads((ROOT / f"Extensions/Blockers/{name}/blockerList.json").read_text()):
            rules.append((name, rule))
    return rules


def domain_matches(host, patterns):
    for p in patterns:
        if p.startswith("*"):
            d = p[1:]
            if host == d or host.endswith("." + d):
                return True
        elif host == p:
            return True
    return False


_compiled = {}


def url_matches(trigger, url):
    pattern = trigger["url-filter"]
    key = (pattern, trigger.get("url-filter-is-case-sensitive", False))
    if key not in _compiled:
        flags = 0 if key[1] else re.IGNORECASE
        _compiled[key] = re.compile(pattern, flags)
    return _compiled[key].search(url) is not None


def applies(trigger, url, page_host, resource_type, third_party):
    if "resource-type" in trigger and resource_type not in trigger["resource-type"]:
        return False
    if "load-type" in trigger:
        want = "third-party" if third_party else "first-party"
        if want not in trigger["load-type"]:
            return False
    if "if-domain" in trigger and not domain_matches(page_host, trigger["if-domain"]):
        return False
    if "unless-domain" in trigger and domain_matches(page_host, trigger["unless-domain"]):
        return False
    return url_matches(trigger, url)


def verdict(rules, url, page, resource_type):
    host = urlparse(url).hostname or ""
    page_host = urlparse(page).hostname or ""
    third = not (host == page_host or host.endswith("." + page_host) or page_host.endswith("." + host))
    blocked_by = None
    for blocker, rule in rules:
        action = rule["action"]["type"]
        if action not in ("block", "ignore-previous-rules"):
            continue
        if applies(rule["trigger"], url, page_host, resource_type, third):
            blocked_by = (blocker, rule["trigger"]["url-filter"]) if action == "block" else None
    return blocked_by


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url", nargs="?")
    ap.add_argument("--hosts", help="file with one host per line; checks https://<host>/")
    ap.add_argument("--type", default="raw", help="Safari resource-type: script, raw, image, document…")
    ap.add_argument("--page", default="https://example.com/", help="page the request is made from")
    args = ap.parse_args()
    rules = load_rules()
    urls = [args.url] if args.url else [f"https://{h.strip()}/" for h in Path(args.hosts).read_text().split() if h.strip()]
    blocked = 0
    for url in urls:
        v = verdict(rules, url, args.page, args.type)
        blocked += v is not None
        print(("BLOCKED " if v else "allowed ") + url + (f"   [{v[0]}: {v[1][:70]}]" if v else ""))
    if len(urls) > 1:
        print(f"{blocked}/{len(urls)} blocked")


if __name__ == "__main__":
    sys.exit(main())

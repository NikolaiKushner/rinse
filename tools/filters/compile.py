#!/usr/bin/env python3
"""Compile Adblock Plus / EasyList filters into Safari content-blocker JSON.

Supports the subset Safari can express:
  network:  ||host^, |anchors|, *, ^, @@exceptions, $third-party, $domain=, resource types,
            $match-case, @@...$document (site allowlist)
  cosmetic: ##selector, domain##selector, ~domain, domain.* (TLD wildcard), #@# exceptions
Everything else (regex rules, $redirect, $removeparam, scriptlets ##+js, procedural
selectors like :has-text) is skipped and counted in the report.

Usage: python3 tools/filters/compile.py   (reads filters/sources.json, writes each blocker's blockerList.json)
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# ABP type option → Safari resource-type.
TYPE_MAP = {
    "script": "script", "image": "image", "stylesheet": "style-sheet", "font": "font",
    "media": "media", "xmlhttprequest": "raw", "xhr": "raw", "ping": "ping", "beacon": "ping",
    "websocket": "websocket", "popup": "popup", "other": "other", "object": "other",
    "subdocument": "document", "frame": "document",
}
ALL_TYPES = sorted(set(TYPE_MAP.values()) - {"popup"} | {"svg-document"})
# Options that don't change what Safari can do with the rule.
IGNORED_OPTIONS = {"important", "all", "~match-case"}

PROCEDURAL = re.compile(
    r":(-abp-|has-text|contains|xpath|matches-css|matches-attr|matches-path|upward|remove|style|"
    r"watch-attr|min-text-length|others|if\b|if-not|nth-ancestor|matches-property|matches-media)"
)
COSMETIC = re.compile(r"^([^#]*?)(##|#@#)(.+)$")
UNSUPPORTED_COSMETIC = re.compile(r"#@?(\?|\$\??|%)#|#@?#\+js|#@?#\^")
REGEX_SPECIALS = set(".+?()[]{}\\$|")
SELECTORS_PER_RULE = 250


class Skip(Exception):
    """A filter Safari cannot express; the message is the reason, for the report."""


def host_prefix() -> str:
    return r"^[^:]+://+([^:/]+\.)?"


def pattern_to_regex(pattern: str) -> str:
    if pattern.startswith("/") and pattern.endswith("/") and len(pattern) > 2:
        raise Skip("regex")
    if not pattern.isascii():
        raise Skip("non-ascii")
    out = ""
    if pattern.startswith("||"):
        out, pattern = host_prefix(), pattern[2:]
    elif pattern.startswith("|"):
        out, pattern = "^", pattern[1:]
    end = ""
    if pattern.endswith("|"):
        pattern, end = pattern[:-1], "$"
    for ch in pattern:
        if ch == "*":
            out += ".*"
        elif ch == "^":
            out += "[/:?=&]"
        elif ch in REGEX_SPECIALS:
            out += "\\" + ch
        else:
            out += ch
    out += end
    if out in ("", ".*"):
        return ".*"
    return out


def normalize_domain(d: str) -> str:
    d = d.strip().lower()
    if not d.isascii():
        d = d.encode("idna").decode()
    return d


@dataclass
class Rules:
    block: list = field(default_factory=list)
    allow: list = field(default_factory=list)
    generic_hide: list = field(default_factory=list)          # selectors
    hide_exceptions: dict = field(default_factory=lambda: defaultdict(set))  # selector → domains
    domain_hide: dict = field(default_factory=lambda: defaultdict(list))     # (kind, domains) → selectors
    skipped: Counter = field(default_factory=Counter)


def parse_options(text: str) -> dict:
    opts = {"types": set(), "not_types": set(), "domains": [], "not_domains": [], "load": None,
            "case": False, "document": False}
    for raw in text.split(","):
        o = raw.strip().lower()
        neg = o.startswith("~")
        name = o[1:] if neg else o
        if not o or o in IGNORED_OPTIONS:
            continue
        if name in ("third-party", "3p"):
            opts["load"] = "first-party" if neg else "third-party"
        elif name in ("first-party", "1p"):
            opts["load"] = "third-party" if neg else "first-party"
        elif o.startswith("domain="):
            for d in raw.split("=", 1)[1].split("|"):
                d = d.strip()
                if d.endswith(".*"):
                    raise Skip("domain-wildcard-option")
                (opts["not_domains"] if d.startswith("~") else opts["domains"]).append(normalize_domain(d.lstrip("~")))
        elif name in TYPE_MAP:
            (opts["not_types"] if neg else opts["types"]).add(TYPE_MAP[name])
        elif o == "match-case":
            opts["case"] = True
        elif o in ("document", "doc"):
            opts["document"] = True
        else:
            raise Skip(f"option:{name.split('=')[0]}")
    return opts


def network_rule(line: str) -> tuple[bool, dict]:
    allow = line.startswith("@@")
    if allow:
        line = line[2:]
    pattern, opts_text = line, ""
    idx = line.rfind("$")
    # Options start after the last $, with an option name ($script, $domain=…, $rewrite=abp-resource:…).
    if idx >= 0 and re.match(r"~?[a-z0-9-]+(=|,|$)", line[idx + 1:], re.I):
        pattern, opts_text = line[:idx], line[idx + 1:]
    opts = parse_options(opts_text) if opts_text else parse_options("")

    trigger: dict = {"url-filter": pattern_to_regex(pattern)}
    if opts["document"]:
        if not allow:
            raise Skip("block-document")
        # @@||site^$document allowlists a whole site: ignore every earlier rule on that page.
        host = re.match(r"^\|\|([a-z0-9.-]+)\^?$", pattern)
        if not host:
            raise Skip("document-pattern")
        return True, {"trigger": {"url-filter": ".*", "if-domain": ["*" + normalize_domain(host.group(1))]},
                      "action": {"type": "ignore-previous-rules"}}
    if trigger["url-filter"] == ".*" and not opts["domains"]:
        raise Skip("too-generic")
    if opts["case"]:
        trigger["url-filter-is-case-sensitive"] = True
    types = opts["types"] or (set(ALL_TYPES) - opts["not_types"] if opts["not_types"] else set())
    if types:
        trigger["resource-type"] = sorted(types)
        if opts["types"] & {"document"} and len(opts["types"]) == 1:
            trigger["load-context"] = ["child-frame"]
    if opts["load"]:
        trigger["load-type"] = [opts["load"]]
    if opts["domains"]:
        # Safari can't combine if-domain and unless-domain; dropping the exclusions over-blocks slightly.
        trigger["if-domain"] = sorted({"*" + d for d in opts["domains"]})
    elif opts["not_domains"]:
        trigger["unless-domain"] = sorted({"*" + d for d in opts["not_domains"]})
    action = {"type": "ignore-previous-rules" if allow else "block"}
    return allow, {"trigger": trigger, "action": action}


# Selectors WebKit rejects (from tools/filters/check-selectors.swift). One bad selector would
# drop every other selector batched into the same rule.
INVALID_FILE = ROOT / "filters/invalid-selectors.txt"
INVALID = set(INVALID_FILE.read_text().splitlines()) if INVALID_FILE.exists() else set()
ALL_SELECTORS: set = set()


def add_cosmetic(rules: Rules, domains_text: str, sep: str, selector: str) -> None:
    selector = selector.strip()
    if selector in INVALID:
        raise Skip("invalid-selector")
    ALL_SELECTORS.add(selector)
    if PROCEDURAL.search(selector):
        raise Skip("procedural-selector")
    if not selector.isascii():
        raise Skip("non-ascii-selector")
    domains = [d.strip() for d in domains_text.split(",") if d.strip()]
    if sep == "#@#":
        if not domains:
            raise Skip("generic-exception")
        for d in domains:
            if not d.startswith("~") and not d.endswith(".*"):
                rules.hide_exceptions[selector].add(normalize_domain(d))
        return
    if not domains:
        rules.generic_hide.append(selector)
        return
    pos = [d for d in domains if not d.startswith("~")]
    neg = [normalize_domain(d[1:]) for d in domains if d.startswith("~") and not d.endswith(".*")]
    if not pos:
        rules.domain_hide[("unless", tuple(sorted(set(neg))))].append(selector)
        return
    exact = sorted({normalize_domain(d) for d in pos if not d.endswith(".*")})
    if exact:
        rules.domain_hide[("if", tuple(exact))].append(selector)
    for d in pos:
        if d.endswith(".*"):
            rules.domain_hide[("tld", normalize_domain(d[:-2]))].append(selector)


def parse_list(text: str, rules: Rules, want_network: bool, want_cosmetic: bool) -> None:
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("!") or line.startswith("["):
            continue
        try:
            if UNSUPPORTED_COSMETIC.search(line):
                raise Skip("unsupported-cosmetic")
            m = COSMETIC.match(line)
            if m:
                if want_cosmetic:
                    add_cosmetic(rules, m.group(1), m.group(2), m.group(3))
                continue
            if not want_network:
                continue
            allow, rule = network_rule(line)
            (rules.allow if allow else rules.block).append(rule)
        except Skip as e:
            rules.skipped[str(e)] += 1


def chunks(items: list, n: int):
    for i in range(0, len(items), n):
        yield items[i:i + n]


def hide_rule(selectors: list, trigger: dict) -> dict:
    return {"trigger": trigger, "action": {"type": "css-display-none", "selector": ", ".join(selectors)}}


def emit(rules: Rules) -> list:
    out = list(rules.block)
    # Generic selectors: those with #@# exceptions get unless-domain, the rest are batched.
    plain, excepted = [], defaultdict(list)
    for sel in dict.fromkeys(rules.generic_hide):
        exc = rules.hide_exceptions.get(sel)
        if exc:
            excepted[tuple(sorted(exc))].append(sel)
        else:
            plain.append(sel)
    for group in chunks(plain, SELECTORS_PER_RULE):
        out.append(hide_rule(group, {"url-filter": ".*"}))
    for domains, sels in excepted.items():
        for group in chunks(sels, SELECTORS_PER_RULE):
            out.append(hide_rule(group, {"url-filter": ".*", "unless-domain": ["*" + d for d in domains]}))
    for (kind, value), sels in rules.domain_hide.items():
        sels = list(dict.fromkeys(sels))
        for group in chunks(sels, SELECTORS_PER_RULE):
            if kind == "if":
                # Drop domains where an exception un-hides every selector in this group.
                domains = [d for d in value if not all(d in rules.hide_exceptions.get(s, ()) for s in group)]
                if domains:
                    out.append(hide_rule(group, {"url-filter": ".*", "if-domain": ["*" + d for d in domains]}))
            elif kind == "unless":
                out.append(hide_rule(group, {"url-filter": ".*", "unless-domain": ["*" + d for d in value]}))
            else:  # tld wildcard: example.* → match the page URL itself
                tld = host_prefix() + re.escape(value).replace("\\-", "-") + r"\.[^/:]+[/:]"
                out.append(hide_rule(group, {"url-filter": tld}))
    # Exceptions only affect earlier rules, so they go last.
    out.extend(rules.allow)
    return out


def compile_blocker(sources: list[dict], cache: Path) -> tuple[list, Counter]:
    rules = Rules()
    for src in sources:
        path = cache / src["file"]
        if not path.exists():  # our own lists live next to sources.json
            path = ROOT / "filters" / src["file"]
        text = path.read_text(encoding="utf-8", errors="replace")
        parse_list(text, rules, src.get("network", True), src.get("cosmetic", True))
    return emit(rules), rules.skipped


def main() -> int:
    dump = sys.argv[2] if len(sys.argv) > 2 and sys.argv[1] == "--dump-selectors" else None
    config = json.loads((ROOT / "filters/sources.json").read_text())
    cache = ROOT / "filters/cache"
    limit = config["maxRulesPerBlocker"]
    failed = False
    for name, blocker in config["blockers"].items():
        out, skipped = compile_blocker(blocker["sources"], cache)
        dest = ROOT / blocker["output"]
        dest.write_text(json.dumps(out, separators=(",", ":")))
        status = "OK" if len(out) <= limit else f"OVER LIMIT ({limit})"
        failed |= len(out) > limit
        top = ", ".join(f"{k} {v}" for k, v in skipped.most_common(5))
        print(f"{name:10} {len(out):7} rules  {dest.stat().st_size / 1e6:5.1f} MB  {status}  | skipped {sum(skipped.values())}: {top}")
    if dump:
        Path(dump).write_text("\n".join(sorted(ALL_SELECTORS)))
        print(f"dumped {len(ALL_SELECTORS)} selectors to {dump}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

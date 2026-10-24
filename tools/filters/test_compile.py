"""Tests for the filter compiler. Run: python3 -m unittest discover tools/filters"""
import unittest

import compile as c


def compile_lines(*lines, network=True, cosmetic=True):
    rules = c.Rules()
    c.parse_list("\n".join(lines), rules, network, cosmetic)
    return c.emit(rules), rules.skipped


class NetworkRules(unittest.TestCase):
    def one(self, line):
        out, skipped = compile_lines(line)
        self.assertEqual(len(out), 1, f"{line!r} → {out} skipped={skipped}")
        return out[0]

    def test_host_anchor_and_separator(self):
        r = self.one("||ads.example.com^")
        self.assertEqual(r["trigger"]["url-filter"], r"^[^:]+://+([^:/]+\.)?ads\.example\.com[/:?=&]")
        self.assertEqual(r["action"]["type"], "block")

    def test_wildcard_and_path(self):
        self.assertEqual(self.one("/banner/*/ad.js")["trigger"]["url-filter"], r"/banner/.*/ad\.js")

    def test_start_and_end_anchors(self):
        self.assertEqual(self.one("|https://x.com/ad|")["trigger"]["url-filter"], r"^https://x\.com/ad$")

    def test_third_party_and_types(self):
        t = self.one("||t.com^$third-party,script,image")["trigger"]
        self.assertEqual(t["load-type"], ["third-party"])
        self.assertEqual(t["resource-type"], ["image", "script"])

    def test_first_party(self):
        self.assertEqual(self.one("||t.com^$~third-party")["trigger"]["load-type"], ["first-party"])

    def test_negated_type_is_complement(self):
        types = self.one("||t.com^$~script")["trigger"]["resource-type"]
        self.assertNotIn("script", types)
        self.assertIn("image", types)

    def test_subdocument_is_child_frame_document(self):
        t = self.one("||t.com^$subdocument")["trigger"]
        self.assertEqual(t["resource-type"], ["document"])
        self.assertEqual(t["load-context"], ["child-frame"])

    def test_domain_option(self):
        t = self.one("||t.com^$domain=a.com|b.org")["trigger"]
        self.assertEqual(t["if-domain"], ["*a.com", "*b.org"])

    def test_negated_domains_become_unless(self):
        self.assertEqual(self.one("||t.com^$domain=~a.com")["trigger"]["unless-domain"], ["*a.com"])

    def test_empty_pattern_with_domain(self):
        t = self.one("$third-party,script,domain=site.ru")["trigger"]
        self.assertEqual(t["url-filter"], ".*")
        self.assertEqual(t["if-domain"], ["*site.ru"])

    def test_match_case(self):
        self.assertTrue(self.one("/Ad.js$match-case")["trigger"]["url-filter-is-case-sensitive"])

    def test_exceptions_go_last(self):
        out, _ = compile_lines("@@||good.com/ad.js", "||ads.com^")
        self.assertEqual([r["action"]["type"] for r in out], ["block", "ignore-previous-rules"])

    def test_document_allowlist(self):
        r = self.one("@@||bank.com^$document")
        self.assertEqual(r["trigger"], {"url-filter": ".*", "if-domain": ["*bank.com"]})
        self.assertEqual(r["action"]["type"], "ignore-previous-rules")

    def test_regex_special_chars_escaped(self):
        self.assertEqual(self.one("/ad?id=(1)")["trigger"]["url-filter"], r"/ad\?id=\(1\)")

    def test_skips(self):
        for line, reason in [
            ("/^https?:\\/\\/ad/", "regex"),
            ("||t.com^$redirect=noop.js", "option:redirect"),
            ("||t.com^$rewrite=abp-resource:blank-mp4", "option:rewrite"),
            ("||t.com^$csp=script-src 'none'", "option:csp"),
            ("||реклама.рф^", "non-ascii"),
            ("$script", "too-generic"),
        ]:
            out, skipped = compile_lines(line)
            self.assertEqual(out, [], line)
            self.assertEqual(skipped[reason], 1, f"{line}: {skipped}")


class CosmeticRules(unittest.TestCase):
    def test_generic_batched(self):
        out, _ = compile_lines("##.ad", "##.banner")
        self.assertEqual(out, [{"trigger": {"url-filter": ".*"}, "action": {"type": "css-display-none", "selector": ".ad, .banner"}}])

    def test_domain_specific(self):
        out, _ = compile_lines("a.com,b.com##.ad")
        self.assertEqual(out[0]["trigger"], {"url-filter": ".*", "if-domain": ["*a.com", "*b.com"]})

    def test_only_exclusions(self):
        out, _ = compile_lines("~a.com##.ad")
        self.assertEqual(out[0]["trigger"], {"url-filter": ".*", "unless-domain": ["*a.com"]})

    def test_generic_with_exception(self):
        out, _ = compile_lines("##.ad", "##.banner", "news.com#@#.ad")
        triggers = {r["action"]["selector"]: r["trigger"] for r in out}
        self.assertEqual(triggers[".banner"], {"url-filter": ".*"})
        self.assertEqual(triggers[".ad"], {"url-filter": ".*", "unless-domain": ["*news.com"]})

    def test_tld_wildcard_matches_page_url(self):
        out, _ = compile_lines("hdrezka.*##body.has-brand .promo")
        self.assertEqual(out[0]["trigger"]["url-filter"], r"^[^:]+://+([^:/]+\.)?hdrezka\.[^/:]+[/:]")

    def test_skips_procedural_and_scriptlets(self):
        out, skipped = compile_lines("site.com##div:has-text(Ad)", "site.com##+js(nobab)", "site.com#$#.x { color: red }")
        self.assertEqual(out, [])
        self.assertEqual(skipped["procedural-selector"], 1)
        self.assertEqual(skipped["unsupported-cosmetic"], 2)

    def test_has_is_supported(self):
        out, _ = compile_lines("site.com##div:has(> .ad)")
        self.assertEqual(out[0]["action"]["selector"], "div:has(> .ad)")

    def test_network_and_cosmetic_flags(self):
        out, _ = compile_lines("##.ad", "||ads.com^", network=False)
        self.assertEqual([r["action"]["type"] for r in out], ["css-display-none"])
        out, _ = compile_lines("##.ad", "||ads.com^", cosmetic=False)
        self.assertEqual([r["action"]["type"] for r in out], ["block"])


if __name__ == "__main__":
    unittest.main()

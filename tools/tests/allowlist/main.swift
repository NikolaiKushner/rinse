// Allowlist tests: pure logic, then the real thing in WebKit: with a site on the allowlist,
// the merged Page Cleaner rules must stop hiding ads there and keep hiding them elsewhere.
// Run: tools/tests/run-allowlist-tests.sh
import Foundation
import WebKit

var failures = 0
func check(_ name: String, _ ok: Bool) {
    print(ok ? "✓ \(name)" : "✗ \(name)")
    if !ok { failures += 1 }
}

// --- normalize / contains -----------------------------------------------------------------
check("strips scheme, www, path, port", Allowlist.normalize("https://www.Example.com:8080/a/b?c") == "example.com")
check("plain host", Allowlist.normalize("news.example.co.uk") == "news.example.co.uk")
check("trailing dot", Allowlist.normalize("example.com.") == "example.com")
check("rejects junk", Allowlist.normalize("not a site") == nil && Allowlist.normalize("") == nil && Allowlist.normalize("localhost") == nil)
check("rejects non-ASCII", Allowlist.normalize("пример.рф") == nil)
check("punycode is fine", Allowlist.normalize("xn--e1afmkfd.xn--p1ai") == "xn--e1afmkfd.xn--p1ai")
check("subdomain matches", Allowlist.contains("m.example.com", in: ["example.com"]))
check("lookalike doesn't match", !Allowlist.contains("notexample.com", in: ["example.com"]))
check("other site doesn't match", !Allowlist.contains("example.org", in: ["example.com"]))

// --- appendRule --------------------------------------------------------------------------
let base = Data(#"[{"trigger":{"url-filter":"ads"},"action":{"type":"block"}}]"#.utf8)
check("empty list leaves rules unchanged", Allowlist.appendRule(to: base, list: []) == base)
let merged = Allowlist.appendRule(to: base, list: ["example.com"])
let parsed = (try? JSONSerialization.jsonObject(with: merged)) as? [[String: Any]]
check("appended rule is last and valid JSON", parsed?.count == 2 &&
      (parsed?.last?["action"] as? [String: String])?["type"] == "ignore-previous-rules" &&
      ((parsed?.last?["trigger"] as? [String: Any])?["if-domain"] as? [String]) == ["*example.com"])
let empty = Allowlist.appendRule(to: Data("[ ]\n".utf8), list: ["example.com"])
check("works on an empty rule list", ((try? JSONSerialization.jsonObject(with: empty)) as? [Any])?.count == 1)

// --- WebKit: the merged Page Cleaner list on and off the allowlisted site -----------------
final class Nav: NSObject, WKNavigationDelegate {
    var done: CheckedContinuation<Void, Never>?
    func webView(_ w: WKWebView, didFinish n: WKNavigation!) { done?.resume(); done = nil }
}

@MainActor
func hiddenOn(_ site: String, rules: String) async throws -> Bool {
    let store = WKContentRuleListStore(url: FileManager.default.temporaryDirectory.appendingPathComponent("rinse-allowlist-test"))!
    let list = try await store.compileContentRuleList(forIdentifier: "cosmetic-\(UUID().uuidString)", encodedContentRuleList: rules)!
    let config = WKWebViewConfiguration()
    config.userContentController.add(list)
    let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 800, height: 600), configuration: config)
    let nav = Nav()
    web.navigationDelegate = nav
    await withCheckedContinuation { cont in
        nav.done = cont
        // .brand-column-content is hidden on every site by Rinse's own rules (filters/rinse.txt).
        web.loadHTMLString("<html><body><div class='brand-column-content'>ad</div></body></html>", baseURL: URL(string: "https://\(site)/")!)
    }
    try await Task.sleep(for: .milliseconds(300))
    let display = try await web.callAsyncJavaScript("return getComputedStyle(document.querySelector('.brand-column-content')).display", contentWorld: .page) as? String
    return display == "none"
}

Task { @MainActor in
    do {
        let bundled = try Data(contentsOf: URL(fileURLWithPath: "Extensions/Blockers/Cosmetic/blockerList.json"))
        let rules = String(decoding: Allowlist.appendRule(to: bundled, list: ["hdrezka.sh"]), as: UTF8.self)
        check("WebKit compiles the merged list", true)
        check("ad hidden on a normal site", try await hiddenOn("news.example.com", rules: rules))
        check("ad NOT hidden on the allowlisted site", !(try await hiddenOn("hdrezka.sh", rules: rules)))
        check("ad NOT hidden on its subdomain", !(try await hiddenOn("m.hdrezka.sh", rules: rules)))
    } catch {
        check("WebKit compiles the merged list: \(error)", false)
    }
    print(failures == 0 ? "PASS" : "FAIL (\(failures))")
    exit(failures == 0 ? 0 : 1)
}
RunLoop.main.run()

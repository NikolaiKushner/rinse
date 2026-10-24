// Loads an HTML page in a WKWebView with Rinse's compiled blockers applied, then reports
// which elements are hidden. Checks the rules themselves, independent of Safari's settings.
// Usage: swift tools/filters/try-page.swift page.html "https://site.example/" "selector1" "selector2"...
import Foundation
import WebKit

let args = CommandLine.arguments
let html = try! String(contentsOfFile: args[1], encoding: .utf8)
let baseURL = URL(string: args[2])!
let probes = Array(args.dropFirst(3))

final class Nav: NSObject, WKNavigationDelegate {
    var done: CheckedContinuation<Void, Never>?
    func webView(_ w: WKWebView, didFinish n: WKNavigation!) { done?.resume(); done = nil }
}

Task { @MainActor in
    let store = WKContentRuleListStore(url: FileManager.default.temporaryDirectory.appendingPathComponent("rinse-try"))!
    let config = WKWebViewConfiguration()
    for name in ["Ads", "Privacy", "Cosmetic"] {
        let json = try String(contentsOfFile: "Extensions/Blockers/\(name)/blockerList.json", encoding: .utf8)
        let list = try await store.compileContentRuleList(forIdentifier: name, encodedContentRuleList: json)!
        config.userContentController.add(list)
    }
    let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 1400, height: 900), configuration: config)
    let nav = Nav()
    web.navigationDelegate = nav
    await withCheckedContinuation { cont in
        nav.done = cont
        web.loadHTMLString(html, baseURL: baseURL)
    }
    try await Task.sleep(for: .seconds(2))
    for sel in probes {
        let js = "const e = document.querySelector(\(String(reflecting: sel))); return e ? getComputedStyle(e).display : 'missing';"
        let display = (try? await web.callAsyncJavaScript(js, contentWorld: .page)) as? String ?? "error"
        print(display == "none" ? "HIDDEN " : "VISIBLE", sel, "(display: \(display))")
    }
    exit(0)
}
RunLoop.main.run()

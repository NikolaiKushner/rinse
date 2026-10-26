// Opens a real URL in a WKWebView (Safari's engine) with Rinse's compiled content blockers,
// or without them, and reports what's on the page: visible text length, page height, how many
// iframes and images are visible, plus optional page text and a PNG snapshot.
// Used for the d3ward adblock test and for checking that blocking doesn't break popular sites.
//
// Usage: swift tools/filters/try-url.swift <url> [--no-blockers] [--wait seconds]
//          [--snapshot out.png] [--text] [--eval 'return …'] [--mobile] [--height px]
import AppKit
import WebKit

let args = CommandLine.arguments
let url = URL(string: args[1])!
let noBlockers = args.contains("--no-blockers")
let wait = args.firstIndex(of: "--wait").flatMap { Double(args[$0 + 1]) } ?? 8
let snapshot = args.firstIndex(of: "--snapshot").map { args[$0 + 1] }
let printText = args.contains("--text")
let evalJS = args.firstIndex(of: "--eval").map { args[$0 + 1] }  // JS body that returns a string
let mobile = args.contains("--mobile")  // iPhone-sized viewport and user agent
let height = args.firstIndex(of: "--height").flatMap { Double(args[$0 + 1]) }  // taller viewport for long snapshots

final class Nav: NSObject, WKNavigationDelegate {
    var done: CheckedContinuation<Void, Never>?
    func webView(_ w: WKWebView, didFinish n: WKNavigation!) { done?.resume(); done = nil }
    func webView(_ w: WKWebView, didFail n: WKNavigation!, withError e: Error) { done?.resume(); done = nil }
    func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) {
        print("load failed: \(e.localizedDescription)"); done?.resume(); done = nil
    }
}

let metrics = """
const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
  return r.width > 2 && r.height > 2 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'; };
return JSON.stringify({
  title: document.title.slice(0, 80),
  textLength: (document.body?.innerText || '').length,
  height: document.documentElement.scrollHeight,
  iframes: [...document.querySelectorAll('iframe')].filter(visible).length,
  images: [...document.images].filter(visible).length,
  text: (document.body?.innerText || '').replace(/\\s+/g, ' ').slice(0, 1500),
});
"""

Task { @MainActor in
    let config = WKWebViewConfiguration()
    if !noBlockers {
        let store = WKContentRuleListStore(url: FileManager.default.temporaryDirectory.appendingPathComponent("rinse-try-url"))!
        for name in ["Ads", "Privacy", "Cosmetic"] {
            let json = try String(contentsOfFile: "Extensions/Blockers/\(name)/blockerList.json", encoding: .utf8)
            let list = try await store.compileContentRuleList(forIdentifier: name, encodedContentRuleList: json)!
            config.userContentController.add(list)
        }
    }
    var viewport = mobile ? NSSize(width: 440, height: 956) : NSSize(width: 1280, height: 900)
    if let height { viewport.height = height }
    let window = NSWindow(contentRect: NSRect(origin: .zero, size: viewport), styleMask: [.titled], backing: .buffered, defer: false)
    let web = WKWebView(frame: window.contentView!.bounds, configuration: config)
    web.customUserAgent = mobile
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1"
        : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15"
    window.contentView!.addSubview(web)
    window.orderBack(nil)
    let nav = Nav()
    web.navigationDelegate = nav
    await withCheckedContinuation { cont in
        nav.done = cont
        if url.isFileURL {
            // Local mocks (docs/appstore/mocks): allow reading sibling folders such as ../raw.
            web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent().deletingLastPathComponent())
        } else {
            web.load(URLRequest(url: url))
        }
    }
    try await Task.sleep(for: .seconds(wait))
    if let json = try? await web.callAsyncJavaScript(metrics, contentWorld: .page) as? String,
       let d = try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any] {
        print("blockers=\(noBlockers ? "off" : "on") title=\"\(d["title"] ?? "")\" text=\(d["textLength"] ?? 0) height=\(d["height"] ?? 0) iframes=\(d["iframes"] ?? 0) images=\(d["images"] ?? 0)")
        if printText { print(d["text"] ?? "") }
    }
    if let evalJS, let out = try? await web.callAsyncJavaScript(evalJS, contentWorld: .page) {
        print(out)
    }
    if let snapshot {
        let config = WKSnapshotConfiguration()
        if let image = try? await web.takeSnapshot(configuration: config),
           let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
           let png = rep.representation(using: .png, properties: [:]) {
            try? png.write(to: URL(fileURLWithPath: snapshot))
        }
    }
    exit(0)
}
NSApplication.shared.setActivationPolicy(.prohibited)
NSApplication.shared.run()

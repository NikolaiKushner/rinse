// Finds CSS selectors WebKit can't parse. Reads one selector per line, prints the invalid ones.
// Usage: swift tools/filters/check-selectors.swift selectors.txt > filters/invalid-selectors.txt
import Foundation
import WebKit

let selectors = try! String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8)
    .split(separator: "\n").map(String.init)

Task { @MainActor in
    let web = WKWebView()
    web.loadHTMLString("<html><body></body></html>", baseURL: nil)
    while web.isLoading { try await Task.sleep(for: .milliseconds(50)) }
    let data = try JSONSerialization.data(withJSONObject: selectors)
    let js = """
    const bad = [];
    for (const s of \(String(data: data, encoding: .utf8)!)) {
      try { document.querySelector(s); } catch { bad.push(s); }
    }
    return bad;
    """
    let bad = try await web.callAsyncJavaScript(js, contentWorld: .page) as? [String] ?? []
    FileHandle.standardError.write("checked \(selectors.count), invalid \(bad.count)\n".data(using: .utf8)!)
    print(bad.joined(separator: "\n"))
    exit(0)
}
RunLoop.main.run()

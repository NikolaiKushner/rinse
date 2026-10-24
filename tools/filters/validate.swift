// Compiles blockerList.json files with WebKit's own content-rule compiler (the one Safari uses)
// and reports errors and timing. Usage: swift tools/filters/validate.swift <file.json>...
import Foundation
import WebKit

@MainActor
func validate(_ path: String) async -> Bool {
    guard let json = try? String(contentsOfFile: path, encoding: .utf8) else {
        print("✗ \(path): cannot read"); return false
    }
    let store = WKContentRuleListStore(url: FileManager.default.temporaryDirectory.appendingPathComponent("rinse-validate"))!
    let start = Date()
    do {
        let list = try await store.compileContentRuleList(forIdentifier: UUID().uuidString, encodedContentRuleList: json)
        print(String(format: "✓ %@  compiled in %.1fs", path, Date().timeIntervalSince(start)))
        if let id = list?.identifier { try? await store.removeContentRuleList(forIdentifier: id) }
        return true
    } catch {
        print("✗ \(path): \(error.localizedDescription) \((error as NSError).userInfo)")
        return false
    }
}

Task { @MainActor in
    var ok = true
    for path in CommandLine.arguments.dropFirst() { ok = await validate(path) && ok }
    exit(ok ? 0 : 1)
}
RunLoop.main.run()

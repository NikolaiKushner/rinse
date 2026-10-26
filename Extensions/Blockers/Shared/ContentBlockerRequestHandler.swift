import Foundation
import os
// The extension also has to link AppKit/UIKit (see OTHER_LDFLAGS in project.yml): Safari's
// content-blocker extension point needs their PlugInKit subsystem. Without it the process
// starts but never gets the request, and Safari's reload fails after ~90s with SFErrorDomain 3.

private let logger = Logger(subsystem: "com.nikolaikushner.rinse", category: "blocker")

/// Hands Safari the bundled rule list, plus a last rule that turns everything off on the sites
/// in the allowlist. Safari compiles it once and applies it without running our code.
final class ContentBlockerRequestHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let bundle = Bundle.main.bundleIdentifier ?? "?"
        guard let url = Bundle.main.url(forResource: "blockerList", withExtension: "json"),
              let provider = NSItemProvider(contentsOf: url) else {
            logger.error("\(bundle, privacy: .public): blockerList.json missing")
            context.cancelRequest(withError: CocoaError(.fileNoSuchFile))
            return
        }
        let item = NSExtensionItem()
        item.attachments = [attachment(bundled: url, fallback: provider, bundle: bundle)]
        context.completeRequest(returningItems: [item]) { expired in
            logger.info("\(bundle, privacy: .public): request completed, expired=\(expired)")
        }
    }

    /// The bundled list as is, or a copy with the allowlist rule appended when the list isn't empty.
    private func attachment(bundled url: URL, fallback: NSItemProvider, bundle: String) -> NSItemProvider {
        let sites = Allowlist.domains
        guard !sites.isEmpty, let rules = try? Data(contentsOf: url) else {
            logger.info("\(bundle, privacy: .public): handing over blockerList.json, no allowlist")
            return fallback
        }
        let merged = Allowlist.appendRule(to: rules, list: sites)
        let out = FileManager.default.temporaryDirectory.appendingPathComponent("blockerList-\(bundle).json")
        do {
            try merged.write(to: out, options: .atomic)
        } catch {
            logger.error("\(bundle, privacy: .public): can't write merged list: \(String(describing: error), privacy: .public)")
            return fallback
        }
        logger.info("\(bundle, privacy: .public): handing over blockerList.json + allowlist of \(sites.count) sites")
        return NSItemProvider(contentsOf: out) ?? fallback
    }
}

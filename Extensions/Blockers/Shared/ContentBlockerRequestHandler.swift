import Foundation
import os
// The extension also has to link AppKit/UIKit (see OTHER_LDFLAGS in project.yml): Safari's
// content-blocker extension point needs their PlugInKit subsystem. Without it the process
// starts but never gets the request, and Safari's reload fails after ~90s with SFErrorDomain 3.

private let logger = Logger(subsystem: "com.nikolaikushner.rinse", category: "blocker")

/// Hands Safari the bundled rule list. Safari compiles it once and applies it without running our code.
final class ContentBlockerRequestHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let bundle = Bundle.main.bundleIdentifier ?? "?"
        guard let url = Bundle.main.url(forResource: "blockerList", withExtension: "json"),
              let provider = NSItemProvider(contentsOf: url) else {
            logger.error("\(bundle, privacy: .public): blockerList.json missing")
            context.cancelRequest(withError: CocoaError(.fileNoSuchFile))
            return
        }
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        logger.info("\(bundle, privacy: .public): handing over blockerList.json (\(size) bytes)")
        let item = NSExtensionItem()
        item.attachments = [provider]
        context.completeRequest(returningItems: [item]) { expired in
            logger.info("\(bundle, privacy: .public): request completed, expired=\(expired)")
        }
    }
}

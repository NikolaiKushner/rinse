import Foundation

/// Hands Safari the bundled rule list. Safari compiles it once and applies it without running our code.
final class ContentBlockerRequestHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let url = Bundle.main.url(forResource: "blockerList", withExtension: "json")!
        let item = NSExtensionItem()
        item.attachments = [NSItemProvider(contentsOf: url)!]
        context.completeRequest(returningItems: [item], completionHandler: nil)
    }
}

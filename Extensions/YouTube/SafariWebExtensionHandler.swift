import SafariServices
import os

private let logger = Logger(subsystem: "com.nikolaikushner.rinse", category: "youtube")

/// Native side of the YouTube extension: answers background.js's native messages with the
/// settings the app stores in the App Group.
final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let message = (context.inputItems.first as? NSExtensionItem)?.userInfo?[SFExtensionMessageKey] as? [String: Any]
        let reply: [String: Any]
        switch message?["type"] as? String {
        case "getSettings":
            reply = ["backgroundPlayback": RinseSettings.backgroundPlayback]
        default:
            reply = ["error": "unknown message"]
        }
        logger.info("message \(String(describing: message?["type"]), privacy: .public) → \(String(describing: reply), privacy: .public)")

        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: reply]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}

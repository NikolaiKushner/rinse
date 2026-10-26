import SafariServices
import os

private let logger = Logger(subsystem: "com.nikolaikushner.rinse", category: "youtube")

/// Native side of the extension: answers background.js's native messages with the settings
/// and allowlist the app stores in the App Group, and lets the Safari popup change the allowlist.
final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let message = (context.inputItems.first as? NSExtensionItem)?.userInfo?[SFExtensionMessageKey] as? [String: Any]
        let type = message?["type"] as? String
        let host = (message?["host"] as? String).flatMap(Allowlist.normalize)

        func reply(_ body: [String: Any]) {
            logger.info("message \(type ?? "nil", privacy: .public) → \(String(describing: body), privacy: .public)")
            let response = NSExtensionItem()
            response.userInfo = [SFExtensionMessageKey: body]
            context.completeRequest(returningItems: [response], completionHandler: nil)
        }

        switch type {
        case "getSettings":
            reply([
                "backgroundPlayback": RinseSettings.backgroundPlayback,
                "siteOff": host.map { Allowlist.contains($0) } ?? false,
            ])
        case "getSite":
            guard let host else { return reply(["ok": false, "error": "no site"]) }
            reply(["ok": true, "site": host, "off": Allowlist.contains(host)])
        case "setSite":
            guard let host, let off = message?["off"] as? Bool else { return reply(["ok": false, "error": "no site"]) }
            Allowlist.set(host, allowed: off)
            Task {
                let errors = await ContentBlockers.reloadAll()
                reply(["ok": errors.isEmpty, "site": host, "off": Allowlist.contains(host), "errors": errors])
            }
        default:
            reply(["error": "unknown message"])
        }
    }
}

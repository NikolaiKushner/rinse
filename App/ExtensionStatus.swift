import SafariServices
import os

private let logger = Logger(subsystem: "com.nikolaikushner.rinse", category: "blockers")

/// Whether Safari has an extension turned on. `nil` means the OS gives no way to ask
/// (Safari Web Extensions on iOS/iPadOS).
enum ExtensionStatus {
    static func isEnabled(_ ext: RinseExtension) async -> Bool? {
        if ext.isContentBlocker {
            return await withCheckedContinuation { cont in
                SFContentBlockerManager.getStateOfContentBlocker(withIdentifier: ext.rawValue) { state, _ in
                    cont.resume(returning: state?.isEnabled ?? false)
                }
            }
        }
        #if os(macOS)
        return await withCheckedContinuation { cont in
            SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: ext.rawValue) { state, _ in
                cont.resume(returning: state?.isEnabled ?? false)
            }
        }
        #else
        return nil
        #endif
    }

    /// Makes Safari recompile a content blocker's rules, e.g. after an app update shipped new lists.
    /// Returns Safari's error if it rejected the rules.
    static func reload(_ ext: RinseExtension) async -> String? {
        guard ext.isContentBlocker else { return nil }
        return await withCheckedContinuation { cont in
            SFContentBlockerManager.reloadContentBlocker(withIdentifier: ext.rawValue) { error in
                if let error {
                    logger.error("reload \(ext.rawValue, privacy: .public) failed: \(String(describing: error), privacy: .public)")
                } else {
                    logger.info("reload \(ext.rawValue, privacy: .public) ok")
                }
                cont.resume(returning: error.map { ($0 as NSError).localizedDescription })
            }
        }
    }

    #if os(macOS)
    static func openSafariSettings(for ext: RinseExtension) {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: ext.rawValue) { _ in }
    }
    #endif
}

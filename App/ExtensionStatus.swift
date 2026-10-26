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

    /// Makes Safari recompile a content blocker's rules. Returns Safari's error if it rejected them.
    static func reload(_ ext: RinseExtension) async -> String? {
        let error = await ContentBlockers.reload(ext)
        if let error {
            logger.error("reload \(ext.rawValue, privacy: .public) failed: \(error, privacy: .public)")
        } else if ext.isContentBlocker {
            logger.info("reload \(ext.rawValue, privacy: .public) ok")
        }
        return error
    }

    #if os(macOS)
    static func openSafariSettings(for ext: RinseExtension) {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: ext.rawValue) { _ in }
    }
    #endif
}

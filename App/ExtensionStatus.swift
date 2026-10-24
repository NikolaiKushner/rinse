import SafariServices

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

    #if os(macOS)
    static func openSafariSettings(for ext: RinseExtension) {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: ext.rawValue) { _ in }
    }
    #endif
}

import SafariServices

/// Asks Safari to recompile content blockers, e.g. after the allowlist changed or an app update
/// shipped new lists. Used by the app and by the extension's native handler.
enum ContentBlockers {
    /// Returns Safari's error, nil if the rules loaded.
    static func reload(_ ext: RinseExtension) async -> String? {
        guard ext.isContentBlocker else { return nil }
        return await withCheckedContinuation { cont in
            SFContentBlockerManager.reloadContentBlocker(withIdentifier: ext.rawValue) { error in
                cont.resume(returning: error.map { ($0 as NSError).localizedDescription })
            }
        }
    }

    /// Reloads every blocker; returns the errors by bundle id (empty when all loaded).
    static func reloadAll() async -> [String: String] {
        var errors: [String: String] = [:]
        for ext in RinseExtension.allCases where ext.isContentBlocker {
            if let error = await reload(ext) { errors[ext.rawValue] = error }
        }
        return errors
    }
}

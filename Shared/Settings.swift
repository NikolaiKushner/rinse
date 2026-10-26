import Foundation

/// Settings shared between the app and the YouTube extension through the App Group.
/// Group ID must match Config/*-shared.entitlements.
enum RinseSettings {
    static let appGroup = "group.com.nikolaikushner.rinse"
    static let store = UserDefaults(suiteName: appGroup) ?? .standard

    /// Keep YouTube playing when Safari goes to the background or the screen locks. Off by default.
    static let backgroundPlaybackKey = "youtube.backgroundPlayback"

    static var backgroundPlayback: Bool { store.bool(forKey: backgroundPlaybackKey) }
}

import Foundation

/// Bundle identifiers of the extensions embedded in Rinse.app. Must match project.yml.
enum RinseExtension: String, CaseIterable, Identifiable {
    case youtube = "com.nikolaikushner.rinse.youtube"
    case ads = "com.nikolaikushner.rinse.ads"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .youtube: "Rinse for YouTube"
        case .ads: "Rinse Ads"
        }
    }

    var subtitle: String {
        switch self {
        case .youtube: "No ads on YouTube, Picture in Picture, background playback"
        case .ads: "Blocks ads and trackers on every site"
        }
    }

    var isContentBlocker: Bool { self == .ads }
}

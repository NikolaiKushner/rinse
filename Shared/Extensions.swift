import Foundation

/// Bundle identifiers of the extensions embedded in Rinse.app. Must match project.yml.
enum RinseExtension: String, CaseIterable, Identifiable {
    case youtube = "com.nikolaikushner.rinse.youtube"
    case ads = "com.nikolaikushner.rinse.ads"
    case privacy = "com.nikolaikushner.rinse.privacy"
    case cosmetic = "com.nikolaikushner.rinse.cosmetic"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .youtube: "Rinse for YouTube"
        case .ads: "Rinse Ads"
        case .privacy: "Rinse Privacy"
        case .cosmetic: "Rinse Page Cleaner"
        }
    }

    var subtitle: String {
        switch self {
        case .youtube: "No ads on YouTube, Picture in Picture, background playback"
        case .ads: "Blocks ad networks on every site"
        case .privacy: "Blocks trackers and analytics"
        case .cosmetic: "Hides leftover ad slots and banners"
        }
    }

    var symbol: String {
        switch self {
        case .youtube: "play.rectangle.fill"
        case .ads: "shield.lefthalf.filled"
        case .privacy: "eye.slash.fill"
        case .cosmetic: "sparkles"
        }
    }

    var isContentBlocker: Bool { self != .youtube }
}

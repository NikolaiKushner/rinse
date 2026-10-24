import SwiftUI

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var states: [RinseExtension: Bool?] = [:]

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(RinseExtension.allCases) { ext in
                        ExtensionRow(ext: ext, enabled: states[ext] ?? nil)
                    }
                } header: {
                    Text("Extensions")
                } footer: {
                    Text("Turn on both extensions and allow Rinse for YouTube on youtube.com.")
                }

                Section("How to turn them on") {
                    ForEach(Array(Self.steps.enumerated()), id: \.offset) { i, step in
                        Label(step, systemImage: "\(i + 1).circle")
                    }
                    #if os(macOS)
                    Button("Open Safari Settings…") {
                        ExtensionStatus.openSafariSettings(for: .youtube)
                    }
                    #endif
                }
            }
            .navigationTitle("Rinse")
            .refreshable { await refresh() }
        }
        .task { await refresh() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await refresh() } }
        }
    }

    private func refresh() async {
        for ext in RinseExtension.allCases {
            states[ext] = await ExtensionStatus.isEnabled(ext)
        }
    }

    #if os(macOS)
    private static let steps = [
        "Safari → Settings → Extensions",
        "Turn on Rinse for YouTube and Rinse Ads",
        "Rinse for YouTube → Edit Websites → youtube.com → Allow",
    ]
    #else
    private static let steps = [
        "Settings → Apps → Safari → Extensions",
        "Turn on Rinse Ads",
        "Rinse for YouTube → turn on, allow on youtube.com",
        "Or in Safari: tap the page menu → Manage Extensions",
    ]
    #endif
}

private struct ExtensionRow: View {
    let ext: RinseExtension
    let enabled: Bool?

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: ext.isContentBlocker ? "shield.lefthalf.filled" : "play.rectangle.fill")
                .font(.title2)
                .foregroundStyle(.tint)
                .frame(width: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(ext.title).font(.headline)
                Text(ext.subtitle).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            switch enabled {
            case .some(true):
                Label("On", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
            case .some(false):
                Label("Off", systemImage: "xmark.circle").foregroundStyle(.secondary)
            case .none:
                Text("Check in Settings").font(.caption).foregroundStyle(.secondary)
            }
        }
        .labelStyle(.titleAndIcon)
        .padding(.vertical, 4)
    }
}

#Preview {
    ContentView()
}

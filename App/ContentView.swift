import SwiftUI

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var states: [RinseExtension: Bool?] = [:]
    @State private var reloads: [RinseExtension: ReloadResult] = [:]
    @State private var reloading = false
    @AppStorage(RinseSettings.backgroundPlaybackKey, store: RinseSettings.store) private var backgroundPlayback = false
    @State private var sites = Allowlist.domains

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(RinseExtension.allCases) { ext in
                        ExtensionRow(ext: ext, enabled: states[ext] ?? nil, reload: reloads[ext])
                    }
                    Button(reloading ? "Reloading rules…" : "Reload rules") {
                        Task { await reloadRules() }
                    }
                    .disabled(reloading)
                } header: {
                    Text("Extensions")
                } footer: {
                    Text("Turn on all four and allow Rinse for YouTube on youtube.com.")
                }

                Section {
                    Toggle(isOn: $backgroundPlayback) {
                        Label("Keep playing in the background", systemImage: "play.circle")
                    }
                } header: {
                    Text("YouTube")
                } footer: {
                    Text("When off, YouTube pauses as usual when you leave Safari or lock the screen. Applies the next time a YouTube page loads.")
                }

                AllowlistSection(sites: $sites) { await reloadRules() }

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
        .task {
            await reloadRules()
        }
        .onChange(of: scenePhase) { _, phase in
            // The Safari popup may have changed the allowlist while the app was in the background.
            if phase == .active {
                sites = Allowlist.domains
                Task { await refresh() }
            }
        }
    }

    /// Makes Safari recompile every blocker's rules. Runs on launch, so a new build's lists take effect.
    private func reloadRules() async {
        reloading = true
        for ext in RinseExtension.allCases where ext.isContentBlocker {
            let error = await ExtensionStatus.reload(ext)
            reloads[ext] = error.map(ReloadResult.failed) ?? .loaded(Date())
        }
        reloading = false
        await refresh()
    }

    private func refresh() async {
        for ext in RinseExtension.allCases {
            states[ext] = await ExtensionStatus.isEnabled(ext)
        }
    }

    #if os(macOS)
    private static let steps = [
        "Safari → Settings → Extensions",
        "Turn on all Rinse extensions",
        "Rinse for YouTube → Edit Websites → youtube.com → Allow",
    ]
    #else
    private static let steps = [
        "Settings → Apps → Safari → Extensions",
        "Turn on Rinse Ads, Privacy and Page Cleaner",
        "Rinse for YouTube → turn on, allow on youtube.com",
        "Or in Safari: tap the page menu → Manage Extensions",
    ]
    #endif
}

private struct ExtensionRow: View {
    let ext: RinseExtension
    let enabled: Bool?
    let reload: ReloadResult?

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: ext.symbol)
                .font(.title2)
                .foregroundStyle(.tint)
                .frame(width: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(ext.title).font(.headline)
                Text(ext.subtitle).font(.caption).foregroundStyle(.secondary)
                switch reload {
                case .loaded(let date):
                    Text("Rules loaded \(date.formatted(date: .omitted, time: .standard))").font(.caption).foregroundStyle(.green)
                case .failed(let error):
                    // Safari only loads rules for a blocker that is turned on, so an error is expected while it's off.
                    Text("Rules not loaded: \(error)").font(.caption).foregroundStyle(enabled == false ? .secondary : Color.red)
                case nil:
                    EmptyView()
                }
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

enum ReloadResult {
    case loaded(Date)
    case failed(String)
}

#Preview {
    ContentView()
}

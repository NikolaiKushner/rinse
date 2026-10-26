import SwiftUI

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var states: [RinseExtension: Bool?] = [:]
    @State private var reloads: [RinseExtension: ReloadResult] = [:]
    @State private var reloading = false
    @State private var refreshing = false
    @State private var refreshAgain = false
    @State private var showSetup = false
    @AppStorage(RinseSettings.backgroundPlaybackKey, store: RinseSettings.store) private var backgroundPlayback = false
    @State private var sites = Allowlist.domains

    /// Extensions we can see are off. On iOS the YouTube extension's state can't be read, so it isn't counted.
    private var offCount: Int { RinseExtension.allCases.filter { states[$0] == .some(false) }.count }
    private var checked: Bool { !states.isEmpty }
    private var allSet: Bool { checked && offCount == 0 }

    var body: some View {
        NavigationStack {
            Form {
                StatusHeader(checked: checked, offCount: offCount)

                Section {
                    if allSet && !showSetup {
                        Button("Show setup steps") { withAnimation { showSetup = true } }
                    } else {
                        SetupSteps()
                    }
                } header: {
                    Text("Set up")
                }

                Section {
                    ForEach(RinseExtension.allCases) { ext in
                        ExtensionRow(ext: ext, enabled: states[ext] ?? nil, reload: reloads[ext])
                    }
                } header: {
                    Text("Extensions")
                } footer: {
                    HStack {
                        Text("Rinse refreshes the rules every time it opens.")
                        Spacer()
                        Button(reloading ? "Refreshing…" : "Refresh now") { Task { await reloadRules() } }
                            .disabled(reloading)
                            .font(.footnote)
                    }
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

                AboutSection()
            }
            .formStyle(.grouped)
            .navigationTitle("Rinse")
            #if os(iOS)
            // The status header already says "Rinse"; the Mac keeps it as the window title.
            .toolbar(.hidden, for: .navigationBar)
            #endif
            // A readable column on iPad and wide Mac windows, on the same grouped background.
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
            .background(groupedBackground.ignoresSafeArea())
            .refreshable { await refresh() }
        }
        .task { await reloadRules() }
        .onChange(of: scenePhase) { _, phase in
            // Coming back from Safari's settings or popup: extensions or the allowlist may have changed.
            if phase == .active {
                sites = Allowlist.domains
                Task { await refresh() }
            }
        }
    }

    #if os(macOS)
    private static let webExtensionStateKnown = true
    #else
    private static let webExtensionStateKnown = false
    #endif

    private var groupedBackground: Color {
        #if os(iOS)
        Color(uiColor: .systemGroupedBackground)
        #else
        Color(nsColor: .windowBackgroundColor)
        #endif
    }

    /// Makes Safari recompile every blocker's rules. Runs on launch, so a new build's lists take effect.
    private func reloadRules() async {
        #if DEBUG
        // Screenshot mode: Safari can't reload blockers in the simulator; don't show its errors.
        if ProcessInfo.processInfo.arguments.contains("-RinseScreenshots") { await refresh(); return }
        #endif
        guard !reloading else { return }
        reloading = true
        for ext in RinseExtension.allCases where ext.isContentBlocker {
            let error = await ExtensionStatus.reload(ext)
            reloads[ext] = error.map(ReloadResult.failed) ?? .loaded(Date())
        }
        reloading = false
        await refresh()
    }

    /// One refresh at a time: launch, pull-to-refresh and coming back to the app can all ask at
    /// once, and overlapping SafariServices calls are what crashed the app on launch.
    private func refresh() async {
        #if DEBUG
        // App Store screenshots: `-RinseScreenshots` shows everything as turned on.
        if ProcessInfo.processInfo.arguments.contains("-RinseScreenshots") {
            states = Dictionary(uniqueKeysWithValues: RinseExtension.allCases.map { ($0, $0.isContentBlocker || Self.webExtensionStateKnown ? true : nil) })
            return
        }
        #endif
        if refreshing { refreshAgain = true; return }
        refreshing = true
        repeat {
            refreshAgain = false
            var next: [RinseExtension: Bool?] = [:]
            for ext in RinseExtension.allCases {
                next[ext] = await ExtensionStatus.isEnabled(ext)
            }
            withAnimation { states = next }
        } while refreshAgain
        refreshing = false
    }
}

// MARK: - Status

private struct StatusHeader: View {
    let checked: Bool
    let offCount: Int

    var body: some View {
        Section {
            HStack(spacing: 16) {
                Image("Logo")
                    .resizable()
                    .frame(width: 64, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Rinse").font(.title2.bold())
                    status
                }
            }
            .padding(.vertical, 6)
        }
    }

    @ViewBuilder private var status: some View {
        if !checked {
            Label("Checking Safari…", systemImage: "ellipsis.circle")
                .foregroundStyle(.secondary)
        } else if offCount == 0 {
            Label("All set. Safari is blocking ads.", systemImage: "checkmark.seal.fill")
                .foregroundStyle(.green)
        } else {
            Label("Turn on \(offCount) more extensions in Safari", systemImage: "exclamationmark.circle.fill")
                .foregroundStyle(.orange)
        }
    }
}

// MARK: - Setup

private struct SetupSteps: View {
    var body: some View {
        #if os(macOS)
        step(1, "In Safari, choose Safari → Settings → Extensions.")
        step(2, "Turn on all four Rinse extensions.")
        step(3, "Select Rinse for YouTube → Edit Websites, and set youtube.com to Allow.")
        Button("Open Safari Settings…") { ExtensionStatus.openSafariSettings(for: .youtube) }
        #else
        step(1, "Open Settings → Apps → Safari → Extensions.")
        step(2, "Turn on Rinse Ads, Rinse Privacy and Rinse Page Cleaner.")
        step(3, "Open Rinse for YouTube, turn it on and allow it on youtube.com.")
        step(4, "Come back here: the status above updates by itself.")
        #endif
    }

    private func step(_ number: Int, _ text: LocalizedStringKey) -> some View {
        Label { Text(text) } icon: { Image(systemName: "\(number).circle.fill").foregroundStyle(.tint) }
    }
}

// MARK: - Extensions

private struct ExtensionRow: View {
    let ext: RinseExtension
    let enabled: Bool?
    let reload: ReloadResult?

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: ext.symbol)
                .font(.title3)
                .foregroundStyle(.tint)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(ext.title)
                Text(ext.subtitle).font(.caption).foregroundStyle(.secondary)
                // Safari only loads rules for a blocker that is on, so an error is expected while it's off.
                if case .failed(let error) = reload, enabled == true {
                    Text("Safari didn't load the rules: \(error)").font(.caption).foregroundStyle(.red)
                }
            }
            Spacer(minLength: 8)
            switch enabled {
            case .some(true):
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green).accessibilityLabel("On")
            case .some(false):
                Text("Off").font(.callout).foregroundStyle(.secondary)
            case .none:
                Text("In Settings").font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

enum ReloadResult {
    case loaded(Date)
    case failed(String)
}

// MARK: - About

private struct AboutSection: View {
    private static let site = URL(string: "https://nikolaikushner.github.io/rinse/")!
    private var localeSite: URL {
        Locale.current.language.languageCode?.identifier == "ru" ? Self.site.appendingPathComponent("ru/") : Self.site
    }
    private var version: String {
        let info = Bundle.main.infoDictionary
        return "\(info?["CFBundleShortVersionString"] as? String ?? "?") (\(info?["CFBundleVersion"] as? String ?? "?"))"
    }

    var body: some View {
        Section {
            Link(destination: localeSite.appendingPathComponent("support.html")) {
                Label("Help and support", systemImage: "questionmark.circle")
            }
            Link(destination: localeSite.appendingPathComponent("privacy.html")) {
                Label("Privacy policy", systemImage: "hand.raised")
            }
            Link(destination: URL(string: "https://github.com/nikolaikushner/rinse")!) {
                Label("Source code", systemImage: "chevron.left.forwardslash.chevron.right")
            }
        } header: {
            Text("About")
        } footer: {
            Text("Version \(version) · Rinse collects no data.")
        }
    }
}

#Preview {
    ContentView()
}

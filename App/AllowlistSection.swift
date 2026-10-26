import SwiftUI

/// "Sites where Rinse is off": the allowlist, editable here and from the Safari popup.
/// Every change makes Safari reload the content blockers.
struct AllowlistSection: View {
    @Binding var sites: [String]
    let onChange: () async -> Void
    @State private var newSite = ""
    @State private var invalid = false

    var body: some View {
        Section {
            ForEach(sites, id: \.self) { site in
                HStack {
                    Label(site, systemImage: "globe")
                    Spacer()
                    Button(role: .destructive) { remove(site) } label: {
                        Image(systemName: "minus.circle.fill")
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Turn Rinse back on for \(site)")
                }
            }
            .onDelete { offsets in offsets.map { sites[$0] }.forEach(remove) }

            HStack {
                TextField("example.com", text: $newSite)
                    .textContentType(.URL)
                    .autocorrectionDisabled()
                    #if os(iOS)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    #endif
                    .onSubmit(add)
                Button("Add", action: add)
                    .disabled(newSite.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            if invalid {
                Text("That doesn't look like a site address.").font(.caption).foregroundStyle(.red)
            }
        } header: {
            Text("Rinse is off on these sites")
        } footer: {
            Text("Use this when a site breaks or you want to support it. Ads and trackers aren't blocked there, and subdomains are included. In Safari you can also use the Rinse button in the extensions menu.")
        }
    }

    private func add() {
        guard let domain = Allowlist.normalize(newSite) else { invalid = true; return }
        invalid = false
        newSite = ""
        Allowlist.set(domain, allowed: true)
        sites = Allowlist.domains
        Task { await onChange() }
    }

    private func remove(_ site: String) {
        Allowlist.set(site, allowed: false)
        sites = Allowlist.domains
        Task { await onChange() }
    }
}

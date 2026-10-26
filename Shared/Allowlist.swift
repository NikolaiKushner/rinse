import Foundation

/// Sites where Rinse is turned off. Stored in the App Group, so the app, the Safari popup
/// (through the YouTube extension's native handler) and the content blockers all see it.
enum Allowlist {
    static let key = "allowlist.domains"

    /// Sorted, normalized domains ("example.com"). A domain also covers its subdomains.
    static var domains: [String] {
        get { (RinseSettings.store.stringArray(forKey: key) ?? []).compactMap(normalize).uniqueSorted() }
        set { RinseSettings.store.set(newValue.compactMap(normalize).uniqueSorted(), forKey: key) }
    }

    /// "https://www.Example.com/path" or "www.example.com" → "example.com". nil if it isn't a host.
    static func normalize(_ input: String) -> String? {
        var text = input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let url = URL(string: text), let host = url.host, url.scheme != nil {
            text = host
        }
        text = text.components(separatedBy: "/").first ?? text
        text = text.components(separatedBy: ":").first ?? text
        if text.hasPrefix("www.") { text.removeFirst(4) }
        while text.hasSuffix(".") { text.removeLast() }
        // Content blockers want ASCII; IDN hosts arrive from Safari already in punycode.
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789-.")
        guard !text.isEmpty, text.contains("."), text.unicodeScalars.allSatisfy(allowed.contains),
              !text.hasPrefix("."), !text.contains("..") else { return nil }
        return text
    }

    /// True if `host` is on the list itself or is a subdomain of a listed domain.
    static func contains(_ host: String, in list: [String] = domains) -> Bool {
        guard let host = normalize(host) else { return false }
        return list.contains { host == $0 || host.hasSuffix("." + $0) }
    }

    static func set(_ host: String, allowed: Bool) {
        guard let domain = normalize(host) else { return }
        var list = domains.filter { $0 != domain }
        if allowed { list.append(domain) }
        domains = list
    }

    /// Content-blocker rule that cancels every earlier rule on the listed sites. Safari applies
    /// rules in order, so this must be the last rule in the list.
    static func blockerRule(for list: [String]) -> String? {
        guard !list.isEmpty else { return nil }
        let rule: [String: Any] = [
            "trigger": ["url-filter": ".*", "if-domain": list.map { "*" + $0 }],
            "action": ["type": "ignore-previous-rules"],
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: rule, options: [.sortedKeys]) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// `rules` (a JSON array) with the allowlist rule appended, or `rules` unchanged when the
    /// list is empty. Works on bytes so the 8 MB lists aren't parsed.
    static func appendRule(to rules: Data, list: [String]) -> Data {
        guard let rule = blockerRule(for: list),
              let end = rules.lastIndex(of: UInt8(ascii: "]")) else { return rules }
        var head = rules[..<end]
        while let last = head.last, [0x20, 0x0A, 0x0D, 0x09].contains(last) { head = head.dropLast() }
        var out = Data(head)
        if head.last != UInt8(ascii: "[") { out.append(UInt8(ascii: ",")) }
        out.append(Data(rule.utf8))
        out.append(UInt8(ascii: "]"))
        return out
    }
}

private extension Array where Element == String {
    func uniqueSorted() -> [String] { Array(Set(self)).sorted() }
}

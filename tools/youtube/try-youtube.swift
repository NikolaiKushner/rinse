// Plays a real YouTube video in a WKWebView (same engine as Safari on Mac) with Rinse's
// YouTube scripts, and prints a timeline: is an ad showing, does the video advance, did the
// player get stuck. Extension APIs are stubbed; page.js runs in the page world, content.js in
// its own content world, both at document start, like in Safari.
//
// Usage: swift tools/youtube/try-youtube.swift <videoId> [--no-rinse] [--no-page] [--seconds N]
//   --no-rinse  load neither script (baseline: what YouTube does without us)
//   --no-page   only content.js (what happens when page.js can't run)
import AppKit
import WebKit

let args = CommandLine.arguments
let videoId = args.count > 1 ? args[1] : "dQw4w9WgXcQ"
let noRinse = args.contains("--no-rinse")
let noPage = args.contains("--no-page")
let seconds = args.firstIndex(of: "--seconds").flatMap { Int(args[$0 + 1]) } ?? 45
// --fake-popup N: at second N, open a stand-in for YouTube's "Ad blockers are not allowed" popup
// (dialog + opened backdrop) and pause the video, like YouTube does. Rinse should hide both and resume.
// --orphan: the dialog is already display:none (as the Cosmetic blocker leaves it) and gets removed
// 1.5s later, like a closed dialog; the backdrop stays, as iron-overlay leaves it. Seen in Safari:
// a dimmed page where only the keyboard works.
// --plain: an ordinary dialog (no enforcement message), like Share. Rinse must leave it alone.
let fakePopupAt = args.firstIndex(of: "--fake-popup").flatMap { Int(args[$0 + 1]) }
let orphan = args.contains("--orphan")
let plain = args.contains("--plain")
let fakePopup = """
const d = document.createElement('tp-yt-paper-dialog');
d.setAttribute('opened', '');
if (!\(plain)) d.append(document.createElement('ytd-enforcement-message-view-model'));
d.style.cssText = 'display:\(orphan ? "none" : "block");position:fixed;inset:30%;background:#fff;z-index:2202';
const b = document.createElement('tp-yt-iron-overlay-backdrop');
b.className = 'opened';
b.style.cssText = 'display:block;position:fixed;inset:0;background:#000;opacity:.6;z-index:2201';
document.body.append(b, d);
document.querySelector('video')?.pause();
if (\(orphan)) setTimeout(() => d.remove(), 1500);
"""
// --keys a,b,c replaces page.js's AD_KEYS, to find which pruned field YouTube reacts to.
let keys = args.firstIndex(of: "--keys").map { args[$0 + 1].split(separator: ",").map { "\"\($0)\"" }.joined(separator: ", ") }
let resources = URL(fileURLWithPath: "Extensions/YouTube/Resources")

func source(_ name: String) -> String {
    try! String(contentsOf: resources.appendingPathComponent(name), encoding: .utf8)
}

// browser.* for content.js: page.js is already injected by the harness, background playback off.
let browserStub = """
window.browser = {
  runtime: {
    getURL: (p) => "about:blank",
    sendMessage: async (m) => m.type === "get-settings" ? { ok: true, settings: { backgroundPlayback: false } } : { ok: true },
  },
  storage: { local: { get: async () => ({}), set: async () => {} } },
};
"""

// Collected in the page world every second.
let probe = """
const p = document.querySelector('.html5-video-player');
const v = document.querySelector('video');
const page = document.documentElement.dataset.rinsePage;
return JSON.stringify({
  ad: !!document.querySelector('.ad-showing, .ad-interrupting'),
  t: v ? Math.round(v.currentTime * 10) / 10 : null,
  dur: v && Number.isFinite(v.duration) ? Math.round(v.duration) : null,
  paused: v ? v.paused : null,
  rate: v ? v.playbackRate : null,
  muted: v ? v.muted : null,
  opacity: v ? getComputedStyle(v).opacity : null,
  state: p ? (p.className.match(/(playing|paused|buffering|unstarted|ended)-mode/) || [""])[0] : "no-player",
  adText: (document.querySelector('.ytp-ad-text, .ytp-ad-preview-text, .ytp-ad-simple-ad-badge, [class*="ad-badge"]') || {}).textContent?.trim().slice(0, 30) || "",
  pruned: page ? JSON.parse(page).pruned : null,
  len: document.documentElement.dataset.rinseLength || null,
  note: !!document.querySelector('.rinse-wait--on'),
  popup: [...document.querySelectorAll('tp-yt-paper-dialog, tp-yt-iron-overlay-backdrop')].some(e => getComputedStyle(e).display !== 'none'),
  // What a click in the middle of the player would land on: the video, or a backdrop over it.
  hit: (() => { const r = document.querySelector('video')?.getBoundingClientRect(); if (!r) return '-'; const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e ? e.tagName.toLowerCase() : '-'; })(),
  skip: [...document.querySelectorAll('.video-ads button, .ytp-ad-module button, [class*="skip" i]')].map(e => (e.className || e.tagName).toString().slice(0, 40) + ':' + (e.offsetParent ? 'vis' : 'hid')).slice(0, 3).join(' | '),
});
"""

final class Delegate: NSObject, WKNavigationDelegate, WKUIDelegate {}

Task { @MainActor in
    let config = WKWebViewConfiguration()
    config.mediaTypesRequiringUserActionForPlayback = []
    let ucc = config.userContentController
    if !noRinse {
        if !noPage {
            var page = source("page.js")
            if let keys { page = page.replacingOccurrences(of: #"const AD_KEYS = \[[^\]]*\];"#, with: "const AD_KEYS = [\(keys)];", options: .regularExpression) }
            ucc.addUserScript(WKUserScript(source: page, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: .page))
        }
        let world = WKContentWorld.world(name: "rinse-content")
        ucc.addUserScript(WKUserScript(source: browserStub + source("content.js"), injectionTime: .atDocumentStart, forMainFrameOnly: true, in: world))
        // Safari injects rinse.css with content.js; here it goes in as a <style> once the page has a head.
        let css = try! JSONSerialization.data(withJSONObject: [source("rinse.css")], options: [.fragmentsAllowed])
        let cssJS = "const s = document.createElement('style'); s.textContent = \(String(data: css, encoding: .utf8)!)[0]; (document.head || document.documentElement).append(s);"
        ucc.addUserScript(WKUserScript(source: cssJS, injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: world))
    }
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 860), styleMask: [.titled], backing: .buffered, defer: false)
    let web = WKWebView(frame: window.contentView!.bounds, configuration: config)
    web.customUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15"
    let delegate = Delegate()
    web.navigationDelegate = delegate
    window.contentView!.addSubview(web)
    window.orderBack(nil)
    web.load(URLRequest(url: URL(string: "https://www.youtube.com/watch?v=\(videoId)")!))

    print("video \(videoId) · rinse: \(noRinse ? "off" : noPage ? "content.js only" : "page.js + content.js")")
    var lastT: Double = -1, stuck = 0, adSeconds = 0, maxStuck = 0
    var noteSeconds = 0, silentStallSeconds = 0  // stall seconds with no "ad skipped" note shown
    var firstProgress: Int? = nil  // second at which the main video first advanced past 0.5s
    for second in 1...seconds {
        try await Task.sleep(for: .seconds(1))
        if second == fakePopupAt { _ = try? await web.callAsyncJavaScript(fakePopup, contentWorld: .page) }
        guard let json = try? await web.callAsyncJavaScript(probe, contentWorld: .page) as? String,
              let d = try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any] else {
            print(String(format: "%3ds  (page not ready)", second)); continue
        }
        let t = d["t"] as? Double ?? -1
        let paused = d["paused"] as? Bool ?? true
        let ad = d["ad"] as? Bool ?? false
        if ad { adSeconds += 1 }
        if !ad, firstProgress == nil, t > 0.5 { firstProgress = second }
        stuck = (!paused && t == lastT && t >= 0) ? stuck + 1 : 0
        maxStuck = max(maxStuck, stuck)
        lastT = t
        let note = d["note"] as? Bool ?? false
        if note { noteSeconds += 1 }
        if stuck >= 1 && !note && !ad { silentStallSeconds += 1 }
        let popup = d["popup"] as? Bool ?? false
        print(String(format: "%3ds  %@%@%@ t=%@ dur=%@ %@ rate=%@ muted=%@ opacity=%@ %@ %@ pruned=%@ len=%@ %@%@",
                     second, ad ? "AD " : "   ", note ? "NOTE " : "", popup ? "POPUP hit=\(d["hit"] ?? "-") " : "", "\(d["t"] ?? "-")", "\(d["dur"] ?? "-")", paused ? "paused " : "playing",
                     "\(d["rate"] ?? "-")", "\(d["muted"] ?? "-")", "\(d["opacity"] ?? "-")", "\(d["state"] ?? "")",
                     (d["adText"] as? String).map { $0.isEmpty ? "" : "[\($0)]" } ?? "", "\(d["pruned"] ?? "-")", "\(d["len"] ?? "-")", ad ? "skip{\(d["skip"] ?? "")}" : "",
                     stuck >= 3 ? "  ⚠︎ STUCK" : ""))
    }
    print("summary: ad=\(adSeconds)s start=\(firstProgress.map { "\($0)s" } ?? "never") longestStall=\(maxStuck)s note=\(noteSeconds)s silentStall=\(silentStallSeconds)s final t=\(lastT)")
    exit(0)
}
NSApplication.shared.setActivationPolicy(.prohibited)
NSApplication.shared.run()

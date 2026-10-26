// Runs content.js against a stub DOM while the player shows an ad. It must:
// - mute the ad, and restore sound and speed once it's gone;
// - jump to the end of a separate ad video (its duration differs from the real video's);
// - play an ad stitched into the stream (same timeline as the video) at 16x instead;
// - press the ad's Skip button once, and never the masthead's "Skip navigation".
import { readFileSync } from "node:fs";
import vm from "node:vm";

function scenario({ videoLength, adDuration, metaDuration }) {
  const video = { currentTime: 1, duration: adDuration, muted: false, playbackRate: 1, paused: false, ended: false, setAttribute() {}, removeAttribute() {} };
  let skipClicks = 0, navClicks = 0;
  const button = (label, inAdUi, onClick) => ({
    click: onClick, dispatchEvent() {}, tagName: "BUTTON", className: "x", getAttribute: () => null,
    textContent: label, offsetParent: {}, closest: () => (inAdUi ? {} : null), matches: () => false,
  });
  const skipButton = button(" Skip ", true, () => skipClicks++);
  const navButton = button("Skip navigation", false, () => navClicks++);
  let adShowing = true;
  const player = {
    querySelector: (s) => (s === "video" ? video : null),
    querySelectorAll: () => (adShowing ? [skipButton] : []),
  };
  const intervals = [];
  const document = {
    documentElement: { dataset: videoLength ? { rinseLength: String(videoLength) } : {}, append() {} },
    head: { append() {} },
    body: { append() {} },
    hidden: false,
    createElement: () => ({ style: {}, append() {}, firstChild: { style: {} } }),
    addEventListener() {},
    querySelector(s) {
      if (s.includes("ad-showing")) return adShowing ? player : null;
      if (s === "video") return video;
      if (s === "meta[itemprop='duration']") return metaDuration ? { getAttribute: () => metaDuration } : null;
      return null;
    },
    // The whole document: the nav button comes first, like in YouTube's masthead.
    querySelectorAll: () => (adShowing ? [navButton, skipButton] : [navButton]),
  };
  const ctx = {
    document, console: { log() {} }, performance, JSON,
    window: { addEventListener() {} },
    browser: {
      runtime: { getURL: (p) => p, sendMessage: async () => ({ ok: true }) },
      storage: { local: { get: async () => ({}), set: async () => {} } },
    },
    setTimeout: () => 0, setInterval: (fn) => intervals.push(fn),
    MutationObserver: class { observe() {} },
    HTMLVideoElement: class {},
    MouseEvent: class { constructor(type) { this.type = type; } },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("../../../Extensions/YouTube/Resources/content.js", import.meta.url), "utf8"), ctx);

  const tick = () => intervals.forEach((f) => f());
  tick(); tick(); tick();  // three ticks within the same second: one press
  const during = { muted: video.muted, rate: video.playbackRate, t: video.currentTime, skipClicks, navClicks };
  adShowing = false;
  tick();
  return { during, after: { muted: video.muted, rate: video.playbackRate } };
}

const separate = scenario({ videoLength: 234, adDuration: 15 });
const stitched = scenario({ videoLength: 234, adDuration: 234 });
// page.js didn't run: the length comes from the watch page's meta tag (3m54s = 234s).
const fromMeta = scenario({ adDuration: 62, metaDuration: "PT3M54S" });
const checks = {
  "separate ad muted": separate.during.muted,
  "separate ad jumped to its end": separate.during.t > 14,
  "separate ad not sped up": separate.during.rate === 1,
  "stitched ad at 16x": stitched.during.rate === 16,
  "stitched ad not seeked": stitched.during.t === 1,
  "Skip pressed once": separate.during.skipClicks === 1,
  "without page.js, meta length still lets it jump": fromMeta.during.t > 61 && fromMeta.during.rate === 1,
  "Skip navigation never pressed": separate.during.navClicks === 0 && stitched.during.navClicks === 0,
  "sound and speed restored": !separate.after.muted && separate.after.rate === 1 && !stitched.after.muted && stitched.after.rate === 1,
};
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
console.log(failed.length ? `FAIL: ${failed.join(", ")}` : "PASS", JSON.stringify({ separate, stitched }));
process.exit(failed.length ? 1 : 0);

// Runs content.js against a stub DOM: when the player shows an ad it must mute, play at 16x
// and press Skip, then restore sound and speed once the ad is gone.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const video = { muted: false, playbackRate: 1, paused: false, ended: false, setAttribute() {}, removeAttribute() {} };
let skipClicks = 0;
const skipButton = { click: () => skipClicks++, getAttribute: () => null, textContent: " Skip ", offsetParent: {} };
const otherButton = { click() {}, getAttribute: () => "Mute", textContent: "", offsetParent: {} };
let adShowing = true;
const player = {
  querySelector: (s) => (s === "video" ? video : null),
  querySelectorAll: () => (adShowing ? [otherButton, skipButton] : []),
};
const node = () => ({ style: {}, append() {}, firstChild: { style: {} } });
const intervals = [];
const document = {
  documentElement: { dataset: {}, append() {} },
  head: { append() {} },
  body: { append() {} },
  hidden: false,
  createElement: node,
  addEventListener() {},
  querySelector(s) {
    if (s.includes("ad-showing")) return adShowing ? player : null;
    if (s === "video") return video;
    if (s.includes("skip")) return adShowing ? skipButton : null;
    return null;
  },
  querySelectorAll: () => [],
};
const ctx = {
  document, console, performance, JSON,
  window: { addEventListener() {} },
  browser: { runtime: { getURL: (p) => "safari-web-extension://x/" + p, sendMessage: async () => ({ ok: true }) } },
  setTimeout: () => 0, setInterval: (fn) => intervals.push(fn),
  MutationObserver: class { observe() {} },
  HTMLVideoElement: class {},
};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("../../../Extensions/YouTube/Resources/content.js", import.meta.url), "utf8"), ctx);

const tick = () => intervals.forEach((f) => f());
tick();
const during = { muted: video.muted, rate: video.playbackRate, skipClicks };
adShowing = false;
tick();
const after = { muted: video.muted, rate: video.playbackRate };
const ok = during.muted && during.rate === 16 && during.skipClicks === 1 && !after.muted && after.rate === 1;
console.log(ok ? "PASS" : "FAIL", "during ad:", JSON.stringify(during), "after:", JSON.stringify(after));
process.exit(ok ? 0 : 1);

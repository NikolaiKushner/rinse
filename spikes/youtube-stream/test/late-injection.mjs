// Runs page.js against a stub DOM where YouTube already set ytInitialPlayerResponse
// (the late-injection case on iOS). It must not throw and must prune + render the badge.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const listeners = [];
const el = () => ({ style: {}, append() {}, set textContent(v) { this._t = v; }, get textContent() { return this._t; }, firstChild: null });
class Doc {}
Object.defineProperty(Doc.prototype, "hidden", { get: () => false, configurable: true });
const badgeEl = el(); badgeEl.firstChild = el();
const document = Object.assign(new Doc(), {
  documentElement: { dataset: {} },
  body: { append() {} },
  addEventListener: (...a) => listeners.push(a),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => { const e = el(); return e; },
});
let created = 0;
document.createElement = () => { created++; return created === 1 ? badgeEl : el(); };
const window = {
  ytInitialPlayerResponse: { adPlacements: [1], playerAds: [2], streamingData: {} },
  addEventListener: (...a) => listeners.push(a),
  fetch: async () => new Response("{}"),
};
const ctx = {
  window, document, Document: Doc, console, performance, setTimeout, setInterval: () => 0, Response,
  XMLHttpRequest: class { open() {} addEventListener() {} },
  MutationObserver: class { observe() {} },
  HTMLVideoElement: class {},
  location: { href: "https://m.youtube.com/watch?v=x" },
};
ctx.window.window = ctx.window;
vm.createContext(ctx);
// page.js addresses globals both bare (fetch, document) and via window; mirror window props onto the context.
vm.runInContext("globalThis.fetch = window.fetch; Object.defineProperty(globalThis, 'ytInitialPlayerResponse', { get: () => window.ytInitialPlayerResponse, configurable: true });", ctx);
vm.runInContext(readFileSync(new URL("../../../Extensions/YouTube/Resources/page.js", import.meta.url), "utf8"), ctx);

const pr = window.ytInitialPlayerResponse;
const ok = !("adPlacements" in pr) && !("playerAds" in pr) && /rinse ✓ · pruned 2/.test(badgeEl.firstChild.textContent);
console.log(ok ? "PASS" : "FAIL", JSON.stringify(pr), "|", badgeEl.firstChild.textContent);
process.exit(ok ? 0 : 1);

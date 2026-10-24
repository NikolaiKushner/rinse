// Runs in the isolated world at document_start.
// 1. Injects page.js into YouTube's own JS world (Safari ignores "world": "MAIN").
//    <script src> loads async, so page.js may arrive after YouTube's inline scripts.
// 2. To cover that race, rewrites the inline script that defines
//    ytInitialPlayerResponse before it runs, renaming its ad keys.
//    The log says which of the two won, which is what this spike needs to learn.
const t0 = performance.now();
const log = (...a) => console.log("[rinse:content]", ...a);

const s = document.createElement("script");
s.src = browser.runtime.getURL("page.js");
s.onload = () => { log(`page.js loaded after ${Math.round(performance.now() - t0)}ms`); s.remove(); };
(document.head || document.documentElement).append(s);

const AD_KEY_RE = /"(adPlacements|adSlots|playerAds|adBreakHeartbeatParams)":/g;
let rewritten = 0;
new MutationObserver((records) => {
  for (const r of records) for (const node of r.addedNodes) {
    if (node.nodeName !== "SCRIPT" || node.src || !node.textContent.includes("ytInitialPlayerResponse")) continue;
    const before = node.textContent;
    const after = before.replace(AD_KEY_RE, '"$1_rinse":');
    if (after !== before) {
      node.textContent = after;
      rewritten++;
      log(`rewrote inline player response at ${Math.round(performance.now() - t0)}ms (pageScriptReady=${!!document.documentElement.dataset.rinse})`);
    }
  }
}).observe(document, { childList: true, subtree: true });

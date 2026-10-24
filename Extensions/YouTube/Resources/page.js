// Page script: runs in YouTube's own JS world, injected by content.js.
// Does only what needs YouTube's JS world:
// 1. Prunes ad payloads out of player responses (initial page data, fetch, XHR).
// 2. Hides "page went to the background" signals from YouTube's code, so it doesn't pause.
// Everything else (badge, ad skipping, background resume, PiP) lives in content.js, which
// still works if YouTube's CSP blocks this file.
// Reports to content.js through <html data-rinse-page="…">. Logs with a [rinse] prefix.
(() => {
  const root = document.documentElement;
  if (root.dataset.rinsePage) return;
  const log = (...a) => console.log("[rinse]", ...a);
  const stats = { pruned: 0 };
  const publish = () => { root.dataset.rinsePage = JSON.stringify(stats); };
  publish();

  const AD_KEYS = ["adPlacements", "adSlots", "playerAds", "adBreakHeartbeatParams"];
  function prune(obj, source) {
    if (!obj || typeof obj !== "object") return obj;
    let hit = 0;
    for (const target of [obj, obj.playerResponse]) {
      if (!target || typeof target !== "object") continue;
      for (const k of AD_KEYS) if (k in target) { delete target[k]; hit++; }
    }
    if (hit) {
      stats.pruned += hit;
      log(`pruned ${hit} ad keys from ${source}`);
      publish();
    }
    return obj;
  }

  // Initial page data: YouTube assigns window.ytInitialPlayerResponse in an inline script.
  for (const name of ["ytInitialPlayerResponse", "ytInitialData"]) {
    let value = window[name];
    if (value) log(`${name} already set when page.js ran (late injection)`), prune(value, name + " (late)");
    Object.defineProperty(window, name, {
      configurable: true,
      get: () => value,
      set: (v) => { value = prune(v, name); },
    });
  }

  const PLAYER_URL = /\/youtubei\/v1\/(player|next|get_midroll_info)/;

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const res = await origFetch.call(this, input, init);
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (!PLAYER_URL.test(url)) return res;
    try {
      const json = prune(await res.clone().json(), "fetch " + url.match(PLAYER_URL)[1]);
      return new Response(JSON.stringify(json), { status: res.status, statusText: res.statusText, headers: res.headers });
    } catch {
      return res;
    }
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (PLAYER_URL.test(String(url))) {
      this.addEventListener("readystatechange", () => {
        if (this.readyState !== 4 || this.responseType && this.responseType !== "text" && this.responseType !== "json") return;
        try {
          const raw = this.responseType === "json" ? this.response : JSON.parse(this.responseText);
          const text = JSON.stringify(prune(raw, "xhr " + String(url).match(PLAYER_URL)[1]));
          Object.defineProperty(this, "responseText", { value: text });
          Object.defineProperty(this, "response", { value: this.responseType === "json" ? JSON.parse(text) : text });
        } catch {}
      });
    }
    return origOpen.call(this, method, url, ...rest);
  };

  // YouTube pauses when it sees the page hidden or unfocused. These overrides only affect
  // YouTube's JS world; content.js still sees the real values.
  for (const [prop, value] of [["hidden", false], ["webkitHidden", false], ["visibilityState", "visible"], ["webkitVisibilityState", "visible"]]) {
    Object.defineProperty(Document.prototype, prop, { get: () => value, configurable: true });
  }
  Document.prototype.hasFocus = () => true;
  for (const ev of ["visibilitychange", "webkitvisibilitychange", "pagehide", "blur", "freeze"]) {
    window.addEventListener(ev, (e) => e.stopImmediatePropagation(), true);
    document.addEventListener(ev, (e) => e.stopImmediatePropagation(), true);
  }

  log("page script installed", location.href);
})();

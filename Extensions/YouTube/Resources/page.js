// Page script: runs in YouTube's own JS world, injected by content.js.
// Does only what needs YouTube's JS world:
// 1. Prunes ad payloads out of player responses (initial page data, fetch, XHR).
// 2. Hides "page went to the background" signals from YouTube's code, so it doesn't pause,
//    when background playback is on in the Rinse app.
// Everything else (badge, ad skipping, background resume, PiP) lives in content.js, which
// still works if YouTube's CSP blocks this file.
// Reports to content.js through <html data-rinse-page="…">. Logs with a [rinse] prefix.
(() => {
  // Safari may load this file several ways (manifest "world": "MAIN", registered content
  // script, scripting.executeScript, <script src>). A Safari that ignores "world" runs it in
  // the isolated world, where hooking YouTube is pointless: extension APIs exist only there.
  if (typeof browser !== "undefined" && browser?.runtime?.id) return;
  const root = document.documentElement;
  if (root.dataset.rinsePage) return;
  const log = (...a) => console.log("[rinse]", ...a);
  const stats = { pruned: 0 };
  const publish = () => { root.dataset.rinsePage = JSON.stringify(stats); };
  publish();

  // Not adBreakHeartbeatParams: without it the player waits ~4s before starting the video
  // (3 of 4 runs in tools/youtube/keys.sh), while keeping it lets no ad through.
  const AD_KEYS = ["adPlacements", "adSlots", "playerAds"];
  function prune(obj, source) {
    if (!obj || typeof obj !== "object") return obj;
    // The real video's length lets content.js tell a separate ad video apart from the content.
    const length = (obj.videoDetails || obj.playerResponse?.videoDetails)?.lengthSeconds;
    if (length) root.dataset.rinseLength = String(length);
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

  // Background playback (only when turned on in the Rinse app; content.js sets the flag):
  // YouTube pauses when it sees the page hidden or unfocused, so hide that from it. The
  // overrides only affect YouTube's JS world; content.js still sees the real values.
  const backgroundOn = () => root.dataset.rinseBackground === "1";
  for (const [prop, value] of [["hidden", false], ["webkitHidden", false], ["visibilityState", "visible"], ["webkitVisibilityState", "visible"]]) {
    const real = Object.getOwnPropertyDescriptor(Document.prototype, prop)?.get;
    if (!real) continue;
    Object.defineProperty(Document.prototype, prop, {
      get() { return backgroundOn() ? value : real.call(this); },
      configurable: true,
    });
  }
  const realHasFocus = Document.prototype.hasFocus;
  Document.prototype.hasFocus = function () { return backgroundOn() || realHasFocus.call(this); };
  for (const ev of ["visibilitychange", "webkitvisibilitychange", "pagehide", "blur", "freeze"]) {
    const swallow = (e) => { if (backgroundOn()) e.stopImmediatePropagation(); };
    window.addEventListener(ev, swallow, true);
    document.addEventListener(ev, swallow, true);
  }

  log("page script installed", location.href);
})();

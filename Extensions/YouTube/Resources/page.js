// Spike page script (runs in YouTube's own JS world).
// 1. Prunes ad payloads out of player responses (initial page data, fetch, XHR).
// 2. Keeps playback alive in the background by hiding visibility changes.
// 3. Adds a PiP button for Safari.
// Everything logs with a [rinse] prefix; open Web Inspector to read it.
(() => {
  if (document.documentElement.dataset.rinse) return;
  document.documentElement.dataset.rinse = "1";
  const log = (...a) => console.log("[rinse]", ...a);
  const stats = { pruned: 0, sources: {} };

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
      stats.sources[source] = (stats.sources[source] || 0) + hit;
      log(`pruned ${hit} ad keys from ${source}`, stats);
      badge();
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

  // Background playback: YouTube pauses when the page becomes hidden.
  Object.defineProperty(Document.prototype, "hidden", { get: () => false, configurable: true });
  Object.defineProperty(Document.prototype, "visibilityState", { get: () => "visible", configurable: true });
  Object.defineProperty(Document.prototype, "webkitVisibilityState", { get: () => "visible", configurable: true });
  for (const ev of ["visibilitychange", "webkitvisibilitychange", "pagehide", "blur"]) {
    window.addEventListener(ev, (e) => e.stopImmediatePropagation(), true);
    document.addEventListener(ev, (e) => e.stopImmediatePropagation(), true);
  }

  // Badge + PiP button.
  let el;
  function badge() {
    if (!document.body) return;
    if (!el) {
      el = document.createElement("div");
      el.style.cssText = "position:fixed;z-index:2147483647;right:8px;bottom:8px;display:flex;gap:6px;font:12px -apple-system,sans-serif;";
      const info = document.createElement("span");
      info.style.cssText = "background:#16a34a;color:#fff;padding:6px 8px;border-radius:8px;";
      const pip = document.createElement("button");
      pip.textContent = "PiP";
      pip.style.cssText = "background:#111;color:#fff;border:0;padding:6px 10px;border-radius:8px;";
      pip.onclick = togglePip;
      el.append(info, pip);
      document.body.append(el);
    }
    el.firstChild.textContent = `rinse: ${stats.pruned} ad keys pruned`;
  }
  async function togglePip() {
    const v = document.querySelector("video");
    if (!v) return log("no <video> on page");
    v.removeAttribute("disablepictureinpicture");
    v.disablePictureInPicture = false;
    try {
      if (v.webkitSetPresentationMode) {
        v.webkitSetPresentationMode(v.webkitPresentationMode === "picture-in-picture" ? "inline" : "picture-in-picture");
      } else if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
      log("PiP toggled", v.webkitPresentationMode);
    } catch (e) {
      log("PiP failed", e);
    }
  }
  document.addEventListener("DOMContentLoaded", badge);
  log("page script installed", location.href);
})();

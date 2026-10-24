// Page script (runs in YouTube's own JS world).
// 1. Prunes ad payloads out of player responses (initial page data, fetch, XHR).
// 2. Keeps playback alive in the background: hides visibility changes from YouTube
//    and resumes the video when iOS pauses it on going to the background.
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

  // Background playback. Two things pause the video when Safari goes to the background:
  // 1. YouTube's own code, reacting to visibility/focus signals: we hide those from it.
  // 2. iOS WebKit itself, which pauses <video> when the page is hidden: we resume right after.
  //    Only pauses within RESUME_WINDOW_MS of going hidden are undone, so pausing from the
  //    lock screen or Control Center later still works.
  const RESUME_WINDOW_MS = 2000;
  const realHidden = Object.getOwnPropertyDescriptor(Document.prototype, "hidden").get;
  const isReallyHidden = () => realHidden.call(document);
  const bg = { hiddenAt: 0, resumed: 0, failed: 0 };

  // On window in the capture phase and registered before the blockers below, so it runs first.
  window.addEventListener("visibilitychange", () => {
    bg.hiddenAt = isReallyHidden() ? performance.now() : 0;
    log("real visibility:", isReallyHidden() ? "hidden" : "visible");
  }, true);

  for (const [prop, value] of [["hidden", false], ["webkitHidden", false], ["visibilityState", "visible"], ["webkitVisibilityState", "visible"]]) {
    Object.defineProperty(Document.prototype, prop, { get: () => value, configurable: true });
  }
  Document.prototype.hasFocus = () => true;
  for (const ev of ["visibilitychange", "webkitvisibilitychange", "pagehide", "blur", "freeze"]) {
    window.addEventListener(ev, (e) => e.stopImmediatePropagation(), true);
    document.addEventListener(ev, (e) => e.stopImmediatePropagation(), true);
  }

  // Media events don't bubble, but they do reach document in the capture phase.
  document.addEventListener("pause", (e) => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement) || v.ended || !isReallyHidden()) return;
    if (!bg.hiddenAt || performance.now() - bg.hiddenAt > RESUME_WINDOW_MS) return;
    log("paused by going to background, resuming");
    resume(v, [0, 250, 1000, 2500]);
  }, true);

  function resume(v, delays) {
    const [delay, ...rest] = delays;
    setTimeout(() => {
      if (!v.paused) return;
      v.play().then(() => {
        bg.resumed++;
        log("background resume ok");
        badge();
      }).catch((err) => {
        if (rest.length) return resume(v, rest);
        bg.failed++;
        log("background resume failed", err);
        badge();
      });
    }, delay);
  }

  // Lets iOS keep the video alive in PiP when going home from fullscreen.
  // YouTube mutates the DOM constantly, so the scan is batched.
  let scanQueued = false;
  new MutationObserver(() => {
    if (scanQueued) return;
    scanQueued = true;
    setTimeout(() => {
      scanQueued = false;
      for (const v of document.querySelectorAll("video:not([autopictureinpicture])")) {
        v.setAttribute("autopictureinpicture", "");
        v.removeAttribute("disablepictureinpicture");
      }
    }, 500);
  }).observe(document.documentElement, { childList: true, subtree: true });

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
    const bgInfo = bg.resumed || bg.failed ? ` · bg ${bg.resumed}✓ ${bg.failed}✗` : "";
    el.firstChild.textContent = `rinse: ${stats.pruned} ad keys pruned${bgInfo}`;
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

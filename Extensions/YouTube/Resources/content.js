// Content script: runs in Safari's isolated world at document_start on youtube.com.
// YouTube's CSP can't block it, so everything that only needs the DOM lives here:
//   - injects page.js (JSON ad pruning, visibility spoofing) and reports whether it ran
//   - skips ads stitched into the stream: mute, 16x, press Skip
//   - background playback, only when turned on in the Rinse app (off by default): hides
//     "page went to the background" from YouTube and resumes the video if iOS pauses it
//   - status badge and PiP button, only in debug mode:
//     run localStorage.setItem("rinse-debug", "1") in the page console, then reload
const log = (...a) => console.log("[rinse:content]", ...a);
const root = document.documentElement;
const state = { page: "loading", pruned: 0, skipped: 0, resumed: 0, failed: 0 };
// Shown in the badge while an ad plays, to see from a screenshot which step doesn't take.
const adDebug = { skip: "none", clicks: 0, rate: 1, left: "" };

// --- Settings ------------------------------------------------------------------------------
// From the Rinse app, via background.js → native handler → App Group. The last known value is
// cached in storage.local so it applies right away on the next page load. page.js reads it
// from <html data-rinse-background>, because it runs in YouTube's world without extension APIs.
const settings = { backgroundPlayback: false };
let settingsFresh = false;
function applySettings(next, fresh) {
  if (!next || (settingsFresh && !fresh)) return;
  settingsFresh ||= fresh;
  settings.backgroundPlayback = next.backgroundPlayback === true;
  root.dataset.rinseBackground = settings.backgroundPlayback ? "1" : "0";
  render();
}
root.dataset.rinseBackground = "0";
browser.storage.local.get("settings").then((r) => applySettings(r?.settings, false), () => {});
browser.runtime.sendMessage({ type: "get-settings" }).then((res) => {
  if (!res?.ok) return log("settings unavailable:", res?.error);
  applySettings(res.settings, true);
  browser.storage.local.set({ settings: res.settings });
}, (err) => log("settings unavailable:", err));

// --- page.js injection -------------------------------------------------------------------
// In the isolated world, document.hidden is the real value: page.js's overrides don't reach here.
// Registered now, before page.js exists, so page.js's event blockers can't swallow it.
let hiddenAt = 0;
let lastPause = null;
window.addEventListener("visibilitychange", (e) => {
  if (!settings.backgroundPlayback) return;
  hiddenAt = document.hidden ? performance.now() : 0;
  if (document.hidden) resumeIfPausedBy("pause just before going to background", lastPause, 1500);
  e.stopImmediatePropagation();
}, true);
// DOM events are shared with YouTube's JS world, and these capture listeners on window are
// registered before any of YouTube's, so YouTube never hears that the page went to the
// background. (Its reads of document.hidden are faked by page.js, when that gets to run.)
for (const ev of ["webkitvisibilitychange", "pagehide", "blur", "freeze"]) {
  window.addEventListener(ev, (e) => {
    if (settings.backgroundPlayback && (e.target === window || e.target === document)) e.stopImmediatePropagation();
  }, true);
}

const script = document.createElement("script");
script.src = browser.runtime.getURL("page.js");
script.onload = () => script.remove();
script.onerror = () => { state.page = "blocked"; render(); };
(document.head || root).append(script);
// <script src> can be blocked by YouTube's CSP; the scripting API isn't. Whichever runs first
// wins, page.js guards against running twice.
browser.runtime.sendMessage({ type: "inject-page" }).then((res) => {
  if (!res?.ok) log("scripting.executeScript failed:", res?.error);
  state.injectError = res?.ok ? null : res?.error;
}, (err) => { state.injectError = String(err); });
setTimeout(() => {
  if (state.page === "loading") { state.page = "did not run"; render(); }
}, 4000);

new MutationObserver(() => {
  try {
    const page = JSON.parse(root.dataset.rinsePage || "null");
    if (page) { state.page = "ok"; state.pruned = page.pruned; render(); }
  } catch {}
}).observe(root, { attributes: true, attributeFilter: ["data-rinse-page"] });

// --- Ad skipping ---------------------------------------------------------------------------
// A bare click() isn't always enough: YouTube's buttons may listen to pointer or touch events.
function press(el) {
  const r = el.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0, height: 0 };
  const at = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
    const Ctor = type.startsWith("pointer") && typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
    el.dispatchEvent(new Ctor(type, at));
  }
  if (typeof TouchEvent === "function") {
    try {
      const touch = new Touch({ identifier: Date.now(), target: el, clientX: at.clientX, clientY: at.clientY });
      el.dispatchEvent(new TouchEvent("touchstart", { ...at, touches: [touch], targetTouches: [touch], changedTouches: [touch] }));
      el.dispatchEvent(new TouchEvent("touchend", { ...at, touches: [], targetTouches: [], changedTouches: [touch] }));
    } catch {}
  }
  el.click();
}

// Class names differ between www and m.youtube.com and change often, so the Skip button is
// found by its label: any button-like element in the player whose text or aria-label says Skip.
const SKIP_LABEL = /^(skip|пропустить|пропуск|überspringen|passer|saltar|salta|pular|pomiń)\b/i;
function findSkipButton(scope) {
  for (const el of scope.querySelectorAll("button, [role='button'], [class*='skip' i]")) {
    const label = (el.getAttribute("aria-label") || el.textContent || "").trim();
    if (SKIP_LABEL.test(label) && el.offsetParent !== null) return el;
  }
  return null;
}
const AD_PLAYER = ".html5-video-player.ad-showing, .html5-video-player.ad-interrupting";
let adActive = false;
let saved = null;

function handleAds() {
  const player = document.querySelector(AD_PLAYER);
  const v = (player || document).querySelector("video");
  if (player && v) {
    if (!adActive) {
      adActive = true;
      adDebug.clicks = 0;
      saved = { muted: v.muted, rate: v.playbackRate };
      state.skipped++;
      log("ad started, skipping");
      render();
    }
    v.muted = true;
    if (v.playbackRate !== 16) v.playbackRate = 16;
    // The ad UI isn't always inside the player element on m.youtube.com.
    const skip = findSkipButton(player) || findSkipButton(document);
    adDebug.skip = skip ? (skip.tagName.toLowerCase() + (skip.className ? "." + String(skip.className).split(" ")[0] : "")) : "none";
    if (skip) {
      press(skip);
      adDebug.clicks++;
    }
    adDebug.rate = v.playbackRate;
    adDebug.left = Number.isFinite(v.duration) ? `${Math.round(v.currentTime)}/${Math.round(v.duration)}s` : "?";
    render();
  } else if (adActive) {
    adActive = false;
    if (v && saved) {
      v.muted = saved.muted;
      v.playbackRate = saved.rate === 16 ? 1 : saved.rate;
    }
    log("ad finished");
  }
}
setInterval(handleAds, 250);
new MutationObserver(handleAds).observe(root, { attributes: true, attributeFilter: ["class"], subtree: true });

// --- Background playback -----------------------------------------------------------------
// iOS pauses <video> when Safari goes to the background. Undo pauses that happen within
// 2s of going hidden; later ones (lock screen, Control Center) are the user's and stay.
document.addEventListener("pause", (e) => {
  const v = e.target;
  if (!settings.backgroundPlayback || !(v instanceof HTMLVideoElement) || v.ended) return;
  lastPause = { v, t: performance.now() };
  if (document.hidden && hiddenAt) resumeIfPausedBy("paused by going to background", lastPause, 2000, hiddenAt);
}, true);

function resumeIfPausedBy(reason, pause, windowMs, since = pause?.t) {
  if (!pause || !pause.v.paused || pause.v.ended || performance.now() - since > windowMs) return;
  log(reason + ", resuming");
  resume(pause.v, [0, 250, 1000, 2500]);
}

function resume(v, delays) {
  const [delay, ...rest] = delays;
  setTimeout(() => {
    if (!v.paused) return;
    v.play().then(() => {
      state.resumed++;
      render();
    }).catch((err) => {
      if (rest.length) return resume(v, rest);
      state.failed++;
      log("background resume failed", err);
      render();
    });
  }, delay);
}

// Lets iOS keep the video alive in PiP when going home from fullscreen. Part of background
// playback, so only when that's on. Batched: YouTube mutates the DOM constantly.
let scanQueued = false;
new MutationObserver(() => {
  if (scanQueued || !settings.backgroundPlayback) return;
  scanQueued = true;
  setTimeout(() => {
    scanQueued = false;
    for (const v of document.querySelectorAll("video:not([autopictureinpicture])")) {
      v.setAttribute("autopictureinpicture", "");
      v.removeAttribute("disablepictureinpicture");
    }
  }, 500);
}).observe(root, { childList: true, subtree: true });

// --- Badge + PiP button --------------------------------------------------------------------
let badge;
const debug = (() => { try { return localStorage.getItem("rinse-debug") === "1"; } catch { return false; } })();
function render() {
  if (!debug || !document.body) return;
  if (!badge) {
    badge = document.createElement("div");
    badge.style.cssText = "position:fixed;z-index:2147483647;left:8px;top:52px;display:flex;gap:6px;font:11px -apple-system,sans-serif;opacity:.9;pointer-events:auto;";
    const info = document.createElement("span");
    info.style.cssText = "color:#fff;padding:5px 8px;border-radius:8px;";
    const pip = document.createElement("button");
    pip.textContent = "PiP";
    pip.style.cssText = "background:#111;color:#fff;border:0;padding:5px 10px;border-radius:8px;";
    pip.onclick = togglePip;
    badge.append(info, pip);
    document.body.append(badge);
  }
  const ok = state.page === "ok";
  const parts = [`rinse · page ${state.page}`, `pruned ${state.pruned}`, `ads skipped ${state.skipped}`];
  if (state.page !== "ok" && state.injectError) parts.push(`inject: ${state.injectError.slice(0, 60)}`);
  if (adActive) parts.push(`AD skip=${adDebug.skip} clicks=${adDebug.clicks} rate=${adDebug.rate} t=${adDebug.left}`);
  parts.push(settings.backgroundPlayback ? `bg on ${state.resumed}✓ ${state.failed}✗` : "bg off");
  badge.firstChild.textContent = parts.join(" · ");
  badge.firstChild.style.background = ok ? "#16a34a" : state.page === "loading" ? "#555" : "#d97706";
}

function togglePip() {
  const v = document.querySelector("video");
  if (!v) return log("no <video> on page");
  v.removeAttribute("disablepictureinpicture");
  try {
    if (v.webkitSetPresentationMode) {
      v.webkitSetPresentationMode(v.webkitPresentationMode === "picture-in-picture" ? "inline" : "picture-in-picture");
    } else if (document.pictureInPictureElement) document.exitPictureInPicture();
    else v.requestPictureInPicture();
  } catch (e) {
    log("PiP failed", e);
  }
}

if (document.body) render();
else document.addEventListener("DOMContentLoaded", render);

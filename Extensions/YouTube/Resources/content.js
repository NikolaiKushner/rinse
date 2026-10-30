// Content script: runs in Safari's isolated world at document_start on youtube.com.
// YouTube's CSP can't block it, so everything that only needs the DOM lives here:
//   - injects page.js (JSON ad pruning, visibility spoofing) and reports whether it ran
//   - if an ad still starts: hide it (rinse.css), mute it, jump to its end or play it at 16x,
//     press its Skip button
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
// siteOff: the user turned Rinse off on youtube.com (popup or app allowlist). Then nothing here
// or in page.js touches the page; data-rinse-off tells page.js.
// From the Rinse app, via background.js → native handler → App Group. The last known value is
// cached in storage.local so it applies right away on the next page load. page.js reads it
// from <html data-rinse-background>, because it runs in YouTube's world without extension APIs.
const settings = { backgroundPlayback: false, siteOff: false };
let settingsFresh = false;
function applySettings(next, fresh) {
  if (!next || (settingsFresh && !fresh)) return;
  settingsFresh ||= fresh;
  settings.siteOff = next.siteOff === true;
  settings.backgroundPlayback = next.backgroundPlayback === true && !settings.siteOff;
  root.dataset.rinseBackground = settings.backgroundPlayback ? "1" : "0";
  root.dataset.rinseOff = settings.siteOff ? "1" : "0";
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
// found by its label. It must sit in the ad UI: desktop YouTube also has a "Skip navigation"
// button in the masthead, and pressing that every 250ms locks up the page.
const SKIP_LABEL = /^(skip|пропустить|пропуск|überspringen|passer|saltar|salta|pular|pomiń)(\s+(ad|ads|рекламу))?\s*[▶›>⏭]?\s*$/i;
const AD_UI = ".video-ads, .ytp-ad-module, [class*='ad-skip' i], [class*='skip-ad' i], [class*='ad-player' i], [id^='skip-button'], [class*='ytp-ad' i]";
function findSkipButton(scope) {
  for (const el of scope.querySelectorAll("button, [role='button'], [class*='skip' i]")) {
    const label = (el.getAttribute("aria-label") || el.textContent || "").trim();
    if (!SKIP_LABEL.test(label) || el.offsetParent === null) continue;
    if (el.closest(AD_UI) || el.matches(AD_UI)) return el;
  }
  return null;
}

// A separate ad video (desktop) has its own short duration: jump to its end. An ad stitched
// into the stream (m.youtube.com) shares the content's timeline, so seeking would skip the
// video itself: play it at 16x instead. page.js publishes the real length; without page.js,
// the watch page's <meta itemprop="duration" content="PT17M59S"> is the fallback.
function contentLength() {
  const fromPage = Number(root.dataset.rinseLength);
  if (fromPage > 0) return fromPage;
  const iso = document.querySelector("meta[itemprop='duration']")?.getAttribute("content") || "";
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}
function isSeparateAd(v) {
  const length = contentLength();
  return Number.isFinite(v.duration) && v.duration > 0 && length > 0 && Math.abs(v.duration - length) > 2;
}
const AD_PLAYER = ".html5-video-player.ad-showing, .html5-video-player.ad-interrupting";
let adActive = false;
let saved = null;
let lastPressAt = -Infinity;

function handleAds() {
  if (settings.siteOff) return;
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
    if (isSeparateAd(v)) {
      if (v.currentTime < v.duration - 0.25) v.currentTime = v.duration - 0.1;
    } else if (v.playbackRate !== 16) {
      v.playbackRate = 16;
    }
    // The ad UI isn't always inside the player element on m.youtube.com.
    const skip = findSkipButton(player) || findSkipButton(document);
    // At most once a second: the button may still be counting down on the first try, and a
    // stream of synthetic taps every 250ms can confuse the player.
    adDebug.skip = skip ? (skip.tagName.toLowerCase() + (skip.className ? "." + String(skip.className).split(" ")[0] : "")) : "none";
    if (skip && performance.now() - lastPressAt > 1000) {
      press(skip);
      lastPressAt = performance.now();
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
    lastPressAt = -Infinity;
    log("ad finished");
  }
}
setInterval(handleAds, 250);
new MutationObserver(handleAds).observe(root, { attributes: true, attributeFilter: ["class"], subtree: true });

// --- "Ad skipped" note -----------------------------------------------------------------------
// After a pruned or skipped ad, YouTube holds the video back for about the ad's length (seen in
// tools/youtube/try-youtube.swift: t stays at 0 while the player is "playing"). That can't be
// avoided from the page, so say what's happening instead of leaving a frozen-looking player.
// Only when Rinse actually removed or skipped an ad, so normal buffering never shows it.
const WAIT_TEXT = /^ru|^uk|^be/i.test(globalThis.navigator?.language || "")
  ? "Реклама пропущена · видео начнётся через мгновение"
  : "Ad skipped · your video starts in a moment";
let stalledSince = 0;
let waitNote = null;
function updateWaitNote() {
  const player = document.querySelector(".html5-video-player");
  const v = player?.querySelector("video");
  const intervened = !settings.siteOff && (state.pruned > 0 || state.skipped > 0);
  const holding = player && v && !adActive && intervened && !v.paused && v.currentTime < 0.3 &&
    player.classList.contains("playing-mode");
  stalledSince = holding ? stalledSince || performance.now() : 0;
  const show = holding && performance.now() - stalledSince > 1000;
  if (show && (!waitNote || !player.contains(waitNote))) {
    waitNote = document.createElement("div");
    waitNote.className = "rinse-wait";
    waitNote.textContent = WAIT_TEXT;
    player.append(waitNote);
  }
  waitNote?.classList.toggle("rinse-wait--on", !!show);
}
setInterval(updateWaitNote, 250);

// --- "Ad blockers are not allowed" popup ---------------------------------------------------
// page.js prunes it from the player response; this is the fallback. When it opens, YouTube
// pauses the video and dims the page with a backdrop. rinse.css hides the popup and the backdrop
// (the Cosmetic blocker only hides the popup, which used to leave a frozen, dimmed player);
// here the video is resumed if YouTube paused it as the popup opened.
const ENFORCEMENT = "ytd-enforcement-message-view-model";
let lastAnyPause = null;
let enforcedAt = 0;
document.addEventListener("pause", (e) => {
  if (!(e.target instanceof HTMLVideoElement)) return;
  lastAnyPause = { v: e.target, t: performance.now() };
  if (performance.now() - enforcedAt < 3000) resumeAfterPopup();
}, true);
function resumeAfterPopup() {
  const pause = lastAnyPause;
  if (settings.siteOff || !pause || !pause.v.paused || pause.v.ended || performance.now() - pause.t > 3000) return;
  log("video paused by the ad blocker popup, resuming");
  resume(pause.v, [0, 250, 1000]);
}
setInterval(() => {
  const open = !!document.querySelector(ENFORCEMENT) && !!document.querySelector("tp-yt-iron-overlay-backdrop.opened");
  if (open && !enforcedAt) {
    enforcedAt = performance.now();
    state.enforced = (state.enforced || 0) + 1;
    log("ad blocker popup opened");
    resumeAfterPopup();
    render();
  } else if (!open) {
    enforcedAt = 0;
  }
}, 250);

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
  if (state.enforced) parts.push(`popup ${state.enforced}`);
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

// Background playback must be off by default and follow the app's setting:
// off → "page went to the background" events reach YouTube and paused videos stay paused;
// on  → content.js swallows them and flags <html data-rinse-background="1"> for page.js.
import { readFileSync } from "node:fs";
import vm from "node:vm";

async function run(settingFromApp) {
  const windowListeners = {};
  const document = {
    documentElement: { dataset: {}, append() {} },
    head: { append() {} },
    body: null,
    hidden: false,
    createElement: () => ({ style: {}, append() {} }),
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const ctx = {
    document, console: { log() {} }, performance, JSON, Promise,
    window: { addEventListener: (type, fn) => (windowListeners[type] ??= []).push(fn) },
    browser: {
      runtime: {
        getURL: (p) => p,
        sendMessage: async (m) => (m.type === "get-settings" ? { ok: true, settings: { backgroundPlayback: settingFromApp } } : { ok: true }),
      },
      storage: { local: { get: async () => ({}), set: async () => {} } },
    },
    setTimeout: () => 0, setInterval: () => 0,
    MutationObserver: class { observe() {} },
    HTMLVideoElement: class {},
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("../../../Extensions/YouTube/Resources/content.js", import.meta.url), "utf8"), ctx);
  await new Promise((r) => setImmediate(r)); // let the settings promises settle

  const swallowed = (type, target = ctx.window) => {
    let stopped = false;
    const e = { type, target, stopImmediatePropagation: () => { stopped = true; } };
    for (const fn of windowListeners[type] ?? []) fn(e);
    return stopped;
  };
  document.hidden = true;
  return {
    flag: document.documentElement.dataset.rinseBackground,
    visibilitychange: swallowed("visibilitychange"),
    pagehide: swallowed("pagehide"),
    blur: swallowed("blur"),
  };
}

const off = await run(false);
const def = await run(undefined);
const on = await run(true);
const ok =
  off.flag === "0" && !off.visibilitychange && !off.pagehide && !off.blur &&
  def.flag === "0" && !def.visibilitychange &&
  on.flag === "1" && on.visibilitychange && on.pagehide && on.blur;
console.log(ok ? "PASS" : "FAIL", "off:", JSON.stringify(off), "default:", JSON.stringify(def), "on:", JSON.stringify(on));
process.exit(ok ? 0 : 1);

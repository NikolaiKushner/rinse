// Background script for content.js:
// - "inject-page": injects page.js into YouTube's own JS world. The scripting API isn't
//   subject to the page's CSP, unlike the <script src> fallback in content.js.
// - "get-settings": reads the app's settings through the native handler (App Group).
// Also registers page.js as a MAIN-world content script at document_start, for Safari versions
// that ignore "world" in the manifest; page.js bails out if it lands in the isolated world.
browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "inject-page" && sender.tab) {
    return browser.scripting.executeScript({
      target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] },
      files: ["page.js"],
      world: "MAIN",
      injectImmediately: true,
    }).then(() => ({ ok: true }), (error) => ({ ok: false, error: String(error?.message ?? error) }));
  }
  if (message?.type === "get-settings") {
    // Safari ignores the application id and always talks to the containing app's extension handler.
    let host = "";
    try { host = new URL(sender.tab?.url || "").hostname; } catch {}
    return browser.runtime.sendNativeMessage("com.nikolaikushner.rinse", { type: "getSettings", host })
      .then((settings) => ({ ok: true, settings }), (error) => ({ ok: false, error: String(error?.message ?? error) }));
  }
});

(async () => {
  try {
    const registered = await browser.scripting.getRegisteredContentScripts({ ids: ["rinse-page"] });
    if (registered.length) return;
    await browser.scripting.registerContentScripts([{
      id: "rinse-page",
      matches: ["*://*.youtube.com/*"],
      js: ["page.js"],
      runAt: "document_start",
      world: "MAIN",
      persistAcrossSessions: true,
    }]);
  } catch (error) {
    console.log("[rinse:background] registerContentScripts failed", error);
  }
})();

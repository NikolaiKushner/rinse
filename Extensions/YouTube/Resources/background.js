// Background script for content.js:
// - "inject-page": injects page.js into YouTube's own JS world. The scripting API isn't
//   subject to the page's CSP, unlike the <script src> fallback in content.js.
// - "get-settings": reads the app's settings through the native handler (App Group).
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
    return browser.runtime.sendNativeMessage("com.nikolaikushner.rinse", { type: "getSettings" })
      .then((settings) => ({ ok: true, settings }), (error) => ({ ok: false, error: String(error?.message ?? error) }));
  }
});

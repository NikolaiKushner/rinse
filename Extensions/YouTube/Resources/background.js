// Injects page.js into YouTube's own JS world for content.js. The scripting API isn't
// subject to the page's CSP, unlike the <script src> fallback in content.js.
browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "inject-page" || !sender.tab) return;
  return browser.scripting.executeScript({
    target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] },
    files: ["page.js"],
    world: "MAIN",
    injectImmediately: true,
  }).then(() => ({ ok: true }), (error) => ({ ok: false, error: String(error?.message ?? error) }));
});

// Toolbar popup: turn Rinse off (or back on) for the current site. Uses activeTab, so the
// extension sees the tab's address only when the user opens this popup.
const ru = /^(ru|uk|be)/i.test(navigator.language || "");
const t = ru
  ? {
      on: "Rinse блокирует рекламу на этом сайте",
      off: "Rinse выключен на этом сайте",
      turnOff: "Выключить на этом сайте",
      turnOn: "Включить снова",
      working: "Секунду…",
      reloaded: "Страница перезагружена.",
      unsupported: "На этой странице Rinse не работает.",
      error: "Не получилось. Откройте приложение Rinse и попробуйте там.",
    }
  : {
      on: "Rinse is blocking ads on this site",
      off: "Rinse is off on this site",
      turnOff: "Turn off on this site",
      turnOn: "Turn back on",
      working: "One moment…",
      reloaded: "Page reloaded.",
      unsupported: "Rinse doesn't work on this page.",
      error: "That didn't work. Open the Rinse app and try there.",
    };

const $ = (id) => document.getElementById(id);
const native = (message) => browser.runtime.sendNativeMessage("com.nikolaikushner.rinse", message);

function render(site, off) {
  $("site").textContent = site;
  $("status").textContent = off ? t.off : t.on;
  $("status").className = "status " + (off ? "off" : "on");
  const button = $("toggle");
  button.hidden = false;
  button.disabled = false;
  button.textContent = off ? t.turnOn : t.turnOff;
  button.className = off ? "" : "secondary";
}

async function main() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  let host = "";
  try { host = new URL(tab?.url || "").hostname; } catch {}
  if (!host || !/^https?:/.test(tab.url)) {
    $("site").textContent = "";
    $("status").textContent = t.unsupported;
    return;
  }
  const state = await native({ type: "getSite", host });
  if (!state?.ok) {
    $("site").textContent = host;
    $("status").textContent = t.error;
    return;
  }
  let off = state.off;
  render(state.site, off);
  $("toggle").onclick = async () => {
    $("toggle").disabled = true;
    $("note").textContent = t.working;
    const res = await native({ type: "setSite", host, off: !off }).catch(() => null);
    if (!res || res.off === off) {
      $("note").textContent = t.error;
      $("toggle").disabled = false;
      return;
    }
    off = res.off;
    render(res.site, off);
    await browser.tabs.reload(tab.id).catch(() => {});
    $("note").textContent = t.reloaded;
  };
}

main().catch(() => { $("status").textContent = t.error; });

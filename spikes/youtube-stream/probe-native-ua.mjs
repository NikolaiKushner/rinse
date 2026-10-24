// Follow-up: same innertube clients, but with each client's own User-Agent.
// A page script can't do this, but the extension could via declarativeNetRequest modifyHeaders.
import { readFileSync } from "node:fs";
const ids = readFileSync("videos.txt", "utf8").split("\n").filter(Boolean).map((l) => l.split(" ")[0]).slice(0, Number(process.argv[2] ?? 8));
const C = {
  IOS: { id: 5, v: "20.10.4", ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)", extra: { deviceMake: "Apple", deviceModel: "iPhone16,2", osName: "iPhone", osVersion: "18.3.2.22D82" } },
  ANDROID_VR: { id: 28, v: "1.62.27", ua: "com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip", extra: { deviceMake: "Oculus", deviceModel: "Quest 3", osName: "Android", osVersion: "12L", androidSdkVersion: 32 } },
  TVHTML5: { id: 7, v: "7.20250312.16.00", ua: "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version" },
  WEB_SAFARI: { name: "WEB", id: 1, v: "2.20261023.01.00", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15,gzip(gfe)" },
};
async function visitor() {
  const r = await fetch("https://www.youtube.com/", { headers: { "User-Agent": C.WEB_SAFARI.ua } });
  return (await r.text()).match(/"VISITOR_DATA":"([^"]+)"/)?.[1];
}
async function bytes(url, ua) {
  const r = await fetch(url, { headers: { "User-Agent": ua, Range: "bytes=0-65535" } }); await r.arrayBuffer(); return r.status;
}
async function hls(url, ua) {
  const m = await fetch(url, { headers: { "User-Agent": ua } }); if (!m.ok) return "master " + m.status;
  const vs = (await m.text()).split("\n").filter((l) => l.startsWith("http")); const v = await fetch(vs[0], { headers: { "User-Agent": ua } });
  if (!v.ok) return "variant " + v.status; const seg = (await v.text()).split("\n").find((l) => l.startsWith("http"));
  return "segment " + (await bytes(seg, ua));
}
const vd = await visitor();
const rows = {};
for (const id of ids) for (const [k, c] of Object.entries(C)) {
  const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: { "User-Agent": c.ua, "Content-Type": "application/json", "X-Youtube-Client-Name": String(c.id), "X-Youtube-Client-Version": c.v, "X-Goog-Visitor-Id": vd },
    body: JSON.stringify({ context: { client: { clientName: c.name ?? k, clientVersion: c.v, hl: "en", gl: "US", visitorData: vd, ...(c.extra ?? {}) } }, videoId: id, contentCheckOk: true, racyCheckOk: true }),
  });
  const j = await res.json(); const sd = j.streamingData ?? {};
  const all = [...(sd.formats ?? []), ...(sd.adaptiveFormats ?? [])];
  const out = { st: j.playabilityStatus?.status ?? res.status, hls: !!sd.hlsManifestUrl, direct: all.filter((f) => f.url).length, cipher: all.filter((f) => f.signatureCipher).length };
  if (sd.hlsManifestUrl) out.hlsCheck = await hls(sd.hlsManifestUrl, c.ua);
  const d = all.find((f) => f.url && f.mimeType?.startsWith("video")); if (d) out.directCheck = await bytes(d.url, c.ua);
  (rows[k] ??= []).push(out);
}
for (const [k, list] of Object.entries(rows)) {
  const agg = {}; for (const o of list) for (const f of ["st", "hlsCheck", "directCheck"]) { const key = f + "=" + (o[f] ?? "-"); agg[key] = (agg[key] || 0) + 1; }
  console.log(k.padEnd(12), `hls ${list.filter((o) => o.hls).length}/${list.length}`, JSON.stringify(agg));
}

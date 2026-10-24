// Deep check of the IOS innertube client: format mix, UA binding, throttling, late 403s.
import { readFileSync } from "node:fs";
const ids = readFileSync("videos.txt", "utf8").split("\n").filter(Boolean).map((l) => l.split(" ")[0]);
const IOS_UA = "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)";
const SAFARI_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
const vd = (await (await fetch("https://www.youtube.com/", { headers: { "User-Agent": SAFARI_UA } })).text()).match(/"VISITOR_DATA":"([^"]+)"/)?.[1];
async function player(id) {
  const r = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: { "User-Agent": IOS_UA, "Content-Type": "application/json", "X-Youtube-Client-Name": "5", "X-Youtube-Client-Version": "20.10.4", "X-Goog-Visitor-Id": vd },
    body: JSON.stringify({ context: { client: { clientName: "IOS", clientVersion: "20.10.4", deviceMake: "Apple", deviceModel: "iPhone16,2", osName: "iPhone", osVersion: "18.3.2.22D82", hl: "en", gl: "US", visitorData: vd } }, videoId: id, contentCheckOk: true, racyCheckOk: true }),
  });
  return r.json();
}
async function speed(url, ua, mb) {
  const t = Date.now(); const r = await fetch(url, { headers: { "User-Agent": ua, Range: `bytes=0-${mb * 1048576 - 1}` } });
  if (r.status >= 400) return { http: r.status };
  const n = (await r.arrayBuffer()).byteLength; const s = (Date.now() - t) / 1000;
  return { http: r.status, MB: +(n / 1048576).toFixed(1), mbps: +((n * 8) / 1e6 / s).toFixed(1) };
}
async function tail(url, ua, len) {
  if (!len) return null; const from = Math.max(0, Number(len) - 65536);
  const r = await fetch(url, { headers: { "User-Agent": ua, Range: `bytes=${from}-${Number(len) - 1}` } }); await r.arrayBuffer(); return r.status;
}
const n = Number(process.argv[2] ?? 21);
for (const id of ids.slice(0, n)) {
  const j = await player(id); const sd = j.streamingData ?? {};
  const muxed = (sd.formats ?? []).filter((f) => f.url);
  const ad = (sd.adaptiveFormats ?? []).filter((f) => f.url);
  const v = ad.filter((f) => f.mimeType.startsWith("video/mp4")).sort((a, b) => (a.height ?? 0) - (b.height ?? 0));
  const v720 = v.find((f) => f.height >= 720) ?? v.at(-1);
  const a = ad.find((f) => f.mimeType.startsWith("audio/mp4"));
  const row = {
    id, st: j.playabilityStatus?.status, hasAds: !!(j.adPlacements || j.playerAds), muxed: muxed.map((f) => f.itag).join(",") || "-",
    videoMp4: v.map((f) => f.height).join(","), codecs: [...new Set(v.map((f) => f.mimeType.match(/codecs="([^.]+)/)?.[1]))].join(","),
    audioMp4: a ? a.itag : "-",
  };
  if (v720) {
    row.v720_iosUA = await speed(v720.url, IOS_UA, 4);
    row.v720_safariUA = await speed(v720.url, SAFARI_UA, 4);
    row.v720_tail = await tail(v720.url, SAFARI_UA, v720.contentLength);
  }
  if (a) row.audio_tail = await tail(a.url, SAFARI_UA, a.contentLength);
  console.log(JSON.stringify(row));
}

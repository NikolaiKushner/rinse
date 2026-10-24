// Where does the IOS-client URL start returning 403? And do watch pages carry ad payloads?
import { readFileSync } from "node:fs";
const ids = readFileSync("videos.txt", "utf8").split("\n").filter(Boolean).map((l) => l.split(" ")[0]);
const IOS_UA = "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)";
const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
const vd = (await (await fetch("https://www.youtube.com/", { headers: { "User-Agent": MAC_UA } })).text()).match(/"VISITOR_DATA":"([^"]+)"/)?.[1];
const j = await (await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
  method: "POST",
  headers: { "User-Agent": IOS_UA, "Content-Type": "application/json", "X-Youtube-Client-Name": "5", "X-Youtube-Client-Version": "20.10.4", "X-Goog-Visitor-Id": vd },
  body: JSON.stringify({ context: { client: { clientName: "IOS", clientVersion: "20.10.4", deviceMake: "Apple", deviceModel: "iPhone16,2", osName: "iPhone", osVersion: "18.3.2.22D82", hl: "en", gl: "US", visitorData: vd } }, videoId: ids[0], contentCheckOk: true, racyCheckOk: true }),
})).json();
const f = j.streamingData.adaptiveFormats.find((x) => x.url && x.mimeType.startsWith("video/mp4") && x.height >= 720);
console.log("format", f.itag, f.height, "len MB", (f.contentLength / 1048576).toFixed(1));
for (const mb of [8, 12, 16, 20, 22, 23, +(f.contentLength / 1048576 - 0.07).toFixed(2)]) {
  const from = Math.floor(mb * 1048576);
  const r = await fetch(f.url, { headers: { "User-Agent": MAC_UA, Range: `bytes=${from}-${from + 65535}` } }); await r.arrayBuffer();
  console.log(`  start @ ${mb}MB → ${r.status}`);
}
const ads = { www: 0, m: 0 };
for (const id of ids.slice(0, 0)) {
  for (const [k, host, ua] of [["www", "www.youtube.com", MAC_UA], ["m", "m.youtube.com", IPHONE_UA]]) {
    const html = await (await fetch(`https://${host}/watch?v=${id}`, { headers: { "User-Agent": ua, "Accept-Language": "en-US" } })).text();
    if (/"adPlacements"|"playerAds"|"adSlots"/.test(html)) ads[k]++;
  }
}
console.log("watch pages with ad payload (of 10):", ads);

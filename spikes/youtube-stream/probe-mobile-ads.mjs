// Where does m.youtube.com get its ad data? Dumps ad-related keys from the page and from MWEB player/next calls.
import { readFileSync } from "node:fs";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
const ids = readFileSync("videos.txt", "utf8").split("\n").filter(Boolean).map((l) => l.split(" ")[0]).slice(0, 6);
function adKeys(obj, path = "", out = new Set()) {
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    if (/^ad|Ad[A-Z]|ads$|Ads[A-Z]|sponsor|promoted/i.test(k) && !/^(add|address|adapt|adaptive|advanced)/i.test(k)) out.add((path ? path.split(".").slice(-2).join(".") + "." : "") + k);
    if (path.split(".").length < 6) adKeys(v, path + "." + k, out);
  }
  return out;
}
for (const id of ids) {
  const res = await fetch(`https://m.youtube.com/watch?v=${id}`, { headers: { "User-Agent": UA, "Accept-Language": "en-US" } });
  const html = await res.text();
  const cookies = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const ver = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1];
  const vd = html.match(/"VISITOR_DATA":"([^"]+)"/)?.[1];
  const scripts = [...html.matchAll(/ytInitialPlayerResponse\s*=\s*(\{|null|JSON)/g)].map((m) => m[1]);
  const call = async (ep) => (await fetch(`https://m.youtube.com/youtubei/v1/${ep}?prettyPrint=false`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json", "X-Youtube-Client-Name": "2", "X-Youtube-Client-Version": ver, "X-Goog-Visitor-Id": vd, Cookie: cookies, Origin: "https://m.youtube.com" },
    body: JSON.stringify({ context: { client: { clientName: "MWEB", clientVersion: ver, hl: "en", gl: "US", visitorData: vd } }, videoId: id }),
  })).json();
  const player = await call("player"), next = await call("next");
  console.log(id, "| page scripts:", scripts.join(","), "| html has adPlacements:", html.includes("adPlacements"), "adSlots:", html.includes("adSlots"));
  console.log("   player keys:", Object.keys(player).join(","));
  console.log("   player ad keys:", [...adKeys(player)].slice(0, 12).join(", "));
  console.log("   next ad keys:", [...adKeys(next)].slice(0, 12).join(", "));
}

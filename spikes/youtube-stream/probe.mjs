// Spike: which YouTube stream sources are available and actually serve bytes,
// when requested the way a Safari content script could request them.
//
// Usage: node probe.mjs [videos.txt] > results.json
// For each video × platform profile it tries:
//   - the watch page's ytInitialPlayerResponse (what page.js reads first)
//   - POST /youtubei/v1/player with several innertube clients, sent with the
//     profile's Safari User-Agent (a page script cannot change its UA)
// and then checks whether the best HLS / direct URL returns media bytes.

import { readFileSync } from "node:fs";

const PROFILES = {
  iphone: {
    host: "m.youtube.com",
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  },
  // iPad Safari requests the desktop site with a Mac UA by default, so iPad and Mac share a profile.
  "mac/ipad": {
    host: "www.youtube.com",
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  },
};

const CLIENTS = {
  WEB: { id: 1, version: null }, // version taken from the page's ytcfg
  MWEB: { id: 2, version: null },
  IOS: {
    id: 5,
    version: "20.10.4",
    extra: { deviceMake: "Apple", deviceModel: "iPhone16,2", osName: "iPhone", osVersion: "18.3.2.22D82" },
  },
  TVHTML5: { id: 7, version: "7.20250312.16.00" },
  WEB_EMBEDDED_PLAYER: { id: 56, version: "1.20250310.01.00", embed: true },
  ANDROID_VR: {
    id: 28,
    version: "1.62.27",
    extra: { deviceMake: "Oculus", deviceModel: "Quest 3", osName: "Android", osVersion: "12L", androidSdkVersion: 32 },
  },
};

const videos = readFileSync(process.argv[2] ?? new URL("videos.txt", import.meta.url), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => {
    const [id, ...rest] = l.trim().split(" ");
    return { id, topic: rest.join(" ") };
  });

function extractJson(html, marker) {
  const start = html.indexOf(marker);
  if (start < 0) return null;
  let i = html.indexOf("{", start);
  let depth = 0, inStr = false, esc = false;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try { return JSON.parse(html.slice(i, j + 1)); } catch { return null; }
    }
  }
  return null;
}

function cookieJar(res) {
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

function summarize(pr) {
  if (!pr) return { ok: false, status: "NO_RESPONSE" };
  const sd = pr.streamingData ?? {};
  const all = [...(sd.formats ?? []), ...(sd.adaptiveFormats ?? [])];
  return {
    ok: pr.playabilityStatus?.status === "OK",
    status: pr.playabilityStatus?.status,
    reason: pr.playabilityStatus?.reason,
    hls: sd.hlsManifestUrl ?? null,
    sabr: !!sd.serverAbrStreamingUrl,
    muxedDirect: (sd.formats ?? []).filter((f) => f.url).map((f) => ({ itag: f.itag, url: f.url, q: f.qualityLabel })),
    directCount: all.filter((f) => f.url).length,
    cipherCount: all.filter((f) => f.signatureCipher || f.cipher).length,
    adaptiveDirect: (sd.adaptiveFormats ?? []).filter((f) => f.url).length,
  };
}

async function fetchPage(profile, id) {
  const res = await fetch(`https://${profile.host}/watch?v=${id}`, {
    headers: { "User-Agent": profile.ua, "Accept-Language": "en-US,en;q=0.9" },
  });
  const html = await res.text();
  const pr = extractJson(html, "ytInitialPlayerResponse = ") ?? extractJson(html, "ytInitialPlayerResponse=");
  const cfg = {
    clientVersion: html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1],
    clientName: html.match(/"INNERTUBE_CLIENT_NAME":"([^"]+)"/)?.[1],
    visitorData: html.match(/"VISITOR_DATA":"([^"]+)"/)?.[1],
    sts: html.match(/"STS":(\d+)/)?.[1],
  };
  return { pr, cfg, cookies: cookieJar(res) };
}

async function fetchInnertube(profile, id, name, page) {
  const c = CLIENTS[name];
  let version = c.version;
  if (!version) version = name === page.cfg.clientName ? page.cfg.clientVersion : name === "MWEB" ? "2.20250311.03.00" : page.cfg.clientVersion;
  const client = { clientName: name, clientVersion: version, hl: "en", gl: "US", visitorData: page.cfg.visitorData, ...(c.extra ?? {}) };
  const body = {
    context: { client, ...(c.embed ? { thirdParty: { embedUrl: "https://www.google.com/" } } : {}) },
    videoId: id,
    contentCheckOk: true,
    racyCheckOk: true,
    ...(page.cfg.sts ? { playbackContext: { contentPlaybackContext: { signatureTimestamp: Number(page.cfg.sts) } } } : {}),
  };
  const res = await fetch(`https://${profile.host}/youtubei/v1/player?prettyPrint=false`, {
    method: "POST",
    headers: {
      "User-Agent": profile.ua,
      "Content-Type": "application/json",
      Origin: `https://${profile.host}`,
      "X-Youtube-Client-Name": String(c.id),
      "X-Youtube-Client-Version": version,
      ...(page.cfg.visitorData ? { "X-Goog-Visitor-Id": page.cfg.visitorData } : {}),
      ...(page.cookies ? { Cookie: page.cookies } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, status: `HTTP_${res.status}` };
  return summarize(await res.json());
}

async function bytesOk(url, ua, range = "bytes=0-65535") {
  try {
    const res = await fetch(url, { headers: { "User-Agent": ua, Range: range } });
    const buf = await res.arrayBuffer();
    return { http: res.status, bytes: buf.byteLength };
  } catch (e) {
    return { http: "ERR", error: String(e) };
  }
}

async function checkHls(url, ua) {
  const master = await fetch(url, { headers: { "User-Agent": ua } });
  if (!master.ok) return { http: master.status, stage: "master" };
  const text = await master.text();
  const variants = text.split("\n").filter((l) => l.startsWith("http"));
  if (!variants.length) return { http: 200, stage: "no-variants" };
  const variant = variants[Math.floor(variants.length / 2)];
  const vres = await fetch(variant, { headers: { "User-Agent": ua } });
  if (!vres.ok) return { http: vres.status, stage: "variant", variants: variants.length };
  const seg = (await vres.text()).split("\n").find((l) => l.startsWith("http"));
  if (!seg) return { http: 200, stage: "no-segments", variants: variants.length };
  return { ...(await bytesOk(seg, ua, "bytes=0-65535")), stage: "segment", variants: variants.length };
}

async function playable(summary, ua) {
  if (!summary.ok) return null;
  const out = {};
  if (summary.hls) out.hls = await checkHls(summary.hls, ua);
  const muxed = summary.muxedDirect?.[0];
  if (muxed) out.direct = { itag: muxed.itag, q: muxed.q, ...(await bytesOk(muxed.url, ua)) };
  return out;
}

async function probeVideo(v) {
  const row = { id: v.id, topic: v.topic, profiles: {} };
  for (const [pname, profile] of Object.entries(PROFILES)) {
    const page = await fetchPage(profile, v.id);
    const sources = { page: summarize(page.pr) };
    for (const name of Object.keys(CLIENTS)) {
      try { sources[name] = await fetchInnertube(profile, v.id, name, page); }
      catch (e) { sources[name] = { ok: false, status: "ERR", reason: String(e) }; }
    }
    for (const s of Object.values(sources)) {
      s.check = await playable(s, profile.ua);
      delete s.muxedDirect; // keep output small; URLs are short-lived anyway
      if (s.hls) s.hls = true;
    }
    row.profiles[pname] = { pageClient: page.cfg.clientName, pageVersion: page.cfg.clientVersion, sources };
  }
  return row;
}

const results = [];
for (let i = 0; i < videos.length; i += 3) {
  results.push(...(await Promise.all(videos.slice(i, i + 3).map(probeVideo))));
  process.stderr.write(`${results.length}/${videos.length}\n`);
}
console.log(JSON.stringify(results, null, 2));

#!/usr/bin/env node
// live_info.mjs — ESM (Node 18+)
// Uso:
//   node live_info.mjs --channel UCxxxxxxxxxxxxxxxx
//   node live_info.mjs -c UCxxxxxxxxxxxxxxxx
//   node live_info.mjs --video 2ONuhbmB-0E
//   node live_info.mjs -v 2ONuhbmB-0E
//
// Notas:
// - Scraping NO oficial; puede romperse si YouTube cambia HTML/JSON.
// - Para producción estable usa YouTube Data API (videos.list?part=liveStreamingDetails).

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/* ------------------------------- Config básica ------------------------------ */

// Rotate User Agents to avoid detection
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
];

const getRandomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const YT_WATCH = (id) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
const YT_LIVE_CHANNEL = (uc) => `https://www.youtube.com/channel/${encodeURIComponent(uc)}/live`;

/* --------------------------------- Helpers --------------------------------- */

function parseArgs(argv = process.argv.slice(2)) {
  const out = { channel: null, video: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === "--channel" || a === "-c") && argv[i + 1]) {
      out.channel = argv[++i];
    } else if ((a === "--video" || a === "-v") && argv[i + 1]) {
      out.video = argv[++i];
    } else if (a === "--help" || a === "-h") {
      out.help = true;
    }
  }
  return out;
}

async function fetchText(url, opts = {}) {
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      // Add delay to avoid rate limiting
      if (opts.delay !== false && attempt > 0) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 2000;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (opts.delay !== false) {
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
      }
      
      const r = await fetch(url, {
        redirect: opts.redirect ?? "follow",
        headers: {
          "User-Agent": getRandomUA(),
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          ...(opts.headers || {}),
        },
      });
      
      if (r.status === 429 && attempt < maxRetries - 1) {
        attempt++;
        console.warn(`Rate limited, retrying in ${Math.pow(2, attempt)} seconds... (attempt ${attempt + 1})`);
        continue;
      }
      
      if (!r.ok && !(r.status >= 300 && r.status < 400)) {
        throw new Error(`HTTP ${r.status} al solicitar ${url}`);
      }
      return { r, text: r.status >= 300 ? "" : await r.text() };
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      attempt++;
      console.warn(`Request failed, retrying... (attempt ${attempt + 1})`);
    }
  }
}

function extractJsonFromHtml(html, varName) {
  const re1 = new RegExp(`${varName}\\s*=\\s*(\\{[\\s\\S]*?\\});`, "m");
  const m1 = html.match(re1);
  if (m1) {
    try { return JSON.parse(m1[1]); } catch {}
  }
  const re2 = new RegExp(`"${varName}"\\s*:\\s*(\\{[\\s\\S]*?\\})\\s*(,|\\})`, "m");
  const m2 = html.match(re2);
  if (m2) {
    try { return JSON.parse(m2[1]); } catch {}
  }
  return null;
}

function extractNumberFromText(s) {
  if (!s) return null;
  const normalized = s.replace(/\u00A0/g, " ");
  const match = normalized.match(/(\d{1,3}([.,\s]\d{3})*|\d+)/);
  if (!match) return null;
  const digits = match[0].replace(/[.,\s]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function deepPickConcurrentViewers(obj) {
  try {
    const found = [];
    const walk = (o) => {
      if (!o || typeof o !== "object") return;
      if (o.viewCount?.runs && Array.isArray(o.viewCount.runs)) {
        const text = o.viewCount.runs.map((r) => r.text).join(" ");
        const n = extractNumberFromText(text);
        if (n !== null) found.push(n);
      }
      if (o.viewCount?.simpleText && typeof o.viewCount.simpleText === "string") {
        const n = extractNumberFromText(o.viewCount.simpleText);
        if (n !== null) found.push(n);
      }
      if (o.runs && Array.isArray(o.runs)) {
        const joined = o.runs.map((r) => r.text).filter(Boolean).join(" ");
        if (/(watching now|espectadores|mirando ahora|viendo ahora)/i.test(joined)) {
          const n = extractNumberFromText(joined);
          if (n !== null) found.push(n);
        }
      }
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (typeof v === "string" && /(watching now|espectadores|mirando ahora|viendo ahora)/i.test(v)) {
          const n = extractNumberFromText(v);
          if (n !== null) found.push(n);
        } else if (v && typeof v === "object") {
          walk(v);
        }
      }
    };
    walk(obj);
    return found.find((n) => Number.isFinite(n) && n >= 0) ?? null;
  } catch { return null; }
}

function pickThumbnails(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(t => t && t.url)
    .map(t => ({ url: t.url, width: t.width ?? null, height: t.height ?? null }));
}

function safeSlice(str, n = 300) {
  if (!str || typeof str !== "string") return null;
  return str.length <= n ? str : str.slice(0, n) + "…";
}

function isLiveNowFromHtml(html) {
  const player = extractJsonFromHtml(html, "ytInitialPlayerResponse");
  const mf = player?.microformat?.playerMicroformatRenderer;
  const isLiveFlag = mf?.liveBroadcastDetails?.isLiveNow === true;
  const flagAnywhere = /"isLiveNow"\s*:\s*true/.test(html);
  const textHint = /(watching now|espectadores|mirando ahora|viendo ahora)/i.test(html);
  return Boolean(isLiveFlag || flagAnywhere || textHint);
}

/* ------------------- Resolver videoId cuando solo hay canal ------------------ */

export async function resolveLiveVideoIdStrict(channelId) {
  // 1) Redirección 3xx fiable
  const { r, text } = await fetchText(YT_LIVE_CHANNEL(channelId), { redirect: "manual" });
  if (r.status >= 300 && r.status < 400) {
    const loc = r.headers.get("location");
    if (loc) {
      const m = String(loc).match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      if (m) return m[1];
      const mAbs = String(loc).match(/watch\?v=([a-zA-Z0-9_-]{11})/);
      if (mAbs) return mAbs[1];
    }
  }

  // 2) Sin redirección → candidato + verificación de que está live
  let html = text;
  if (!html) {
    const second = await fetchText(YT_LIVE_CHANNEL(channelId), { redirect: "follow" });
    html = second.text;
  }
  if (!html) return null;

  const mVid = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
  if (!mVid) return null;
  const candidate = mVid[1];

  const { text: watchHtml } = await fetchText(YT_WATCH(candidate));
  if (isLiveNowFromHtml(watchHtml)) return candidate;

  return null; // no hay directo confirmado
}

/* ------------------------ Obtener metadatos desde videoId ------------------- */

export async function getLiveMetaFromVideoId(videoId) {
  const { text: html } = await fetchText(YT_WATCH(videoId));
  const player = extractJsonFromHtml(html, "ytInitialPlayerResponse");
  const initial = extractJsonFromHtml(html, "ytInitialData");

  const mf = player?.microformat?.playerMicroformatRenderer;
  const vd = player?.videoDetails;

  const isLiveNow =
    mf?.liveBroadcastDetails?.isLiveNow === true ||
    player?.playabilityStatus?.liveStreamability != null ||
    /"isLiveNow"\s*:\s*true/.test(html);

  let concurrentViewers = deepPickConcurrentViewers(initial) ?? deepPickConcurrentViewers(player) ?? null;

  const title = vd?.title ?? mf?.title ?? null;
  const channelName = vd?.author ?? mf?.ownerChannelName ?? null;
  const description = safeSlice(vd?.shortDescription ?? mf?.description);
  const thumbnails =
    pickThumbnails(vd?.thumbnail?.thumbnails) ||
    pickThumbnails(mf?.thumbnail?.thumbnails) ||
    [];
  const tags = vd?.keywords ?? mf?.keywords ?? null;
  const category = mf?.category ?? null;
  const lengthSeconds = vd?.lengthSeconds ? Number(vd.lengthSeconds) : null;
  const isLiveContent = vd?.isLiveContent === true;

  const actualStartTime = mf?.liveBroadcastDetails?.startTimestamp ?? null;
  const scheduledStartTime =
    mf?.liveBroadcastDetails?.scheduledStartTimestamp ?? null;
  const endTime = mf?.liveBroadcastDetails?.endTimestamp ?? null;

  return {
    videoId,
    isLiveNow: Boolean(isLiveNow),
    title,
    channelName,
    concurrentViewers: concurrentViewers ?? null,
    actualStartTime,
    scheduledStartTime,
    endTime,
    description,
    thumbnails,
    tags,
    category,
    isLiveContent,
    lengthSeconds
  };
}

/* ----------------------------------- CLI ----------------------------------- */

function printHelp() {
  console.log(`Uso:
  node live_info.mjs --channel UCxxxxxxxxxxxxxx   # Resuelve el directo y muestra metadatos
  node live_info.mjs --video   2ONuhbmB-0E        # Usa directamente un videoId

Notas:
- Devuelve JSON por stdout.
- Exit codes: 0=ok, 2=error, 3=no hay directo (en modo canal).
`);
}

export async function runCLI() {
  const args = parseArgs();
  if (args.help || (!args.channel && !args.video)) {
    printHelp();
    process.exit(0);
  }

  try {
    // Try new service first, fallback to original methods
    const youtubeService = await import('../services/youtubeService.js').then(m => m.default);
    
    if (args.video) {
      try {
        const meta = await youtubeService.getLiveMetadata(null, args.video);
        console.log(JSON.stringify({ mode: "video", ...meta }, null, 2));
        process.exit(meta.isLiveNow ? 0 : 0);
        return;
      } catch (serviceError) {
        console.warn("Service failed, trying original method:", serviceError.message);
        // Fallback to original method
        const meta = await getLiveMetaFromVideoId(args.video);
        console.log(JSON.stringify({ mode: "video", method: "fallback", ...meta }, null, 2));
        process.exit(meta.isLiveNow ? 0 : 0);
        return;
      }
    }

    if (args.channel) {
      if (!args.channel.startsWith("UC")) {
        console.error("El channelId debe empezar por 'UC'.");
        process.exit(2);
      }
      
      try {
        const meta = await youtubeService.getLiveMetadata(args.channel);
        if (!meta) {
          console.log(JSON.stringify({
            mode: "channel",
            channelId: args.channel,
            videoId: null,
            isLiveNow: false,
            note: "El canal no está en directo"
          }, null, 2));
          process.exit(3);
          return;
        }
        console.log(JSON.stringify({
          mode: "channel",
          channelId: args.channel,
          ...meta
        }, null, 2));
        process.exit(meta.isLiveNow ? 0 : 0);
        return;
      } catch (serviceError) {
        console.warn("Service failed, trying original method:", serviceError.message);
        // Fallback to original method
        const videoId = await resolveLiveVideoIdStrict(args.channel);
        if (!videoId) {
          console.log(JSON.stringify({
            mode: "channel",
            channelId: args.channel,
            videoId: null,
            isLiveNow: false,
            note: "El canal no está en directo"
          }, null, 2));
          process.exit(3);
          return;
        }
        const meta = await getLiveMetaFromVideoId(videoId);
        console.log(JSON.stringify({
          mode: "channel",
          channelId: args.channel,
          method: "fallback",
          ...meta
        }, null, 2));
        process.exit(meta.isLiveNow ? 0 : 0);
        return;
      }
    }

    printHelp();
    process.exit(0);
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(2);
  }
}

/* ---------------------------- Ejecutar si main ----------------------------- */

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  runCLI();
}

// scripts/build-videos.js (ESM)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prefer env var so GitHub Actions / local runs don't hardcode keys
const API_KEY = process.env.YT_API_KEY || "AIzaSyAMoGwN5pGvIH42UaKyaM984yIdY6a9xPA";
const CHANNEL_ID = process.env.YT_CHANNEL_ID || "UC3GAkN1CvV7k7IZZLa7-neg";

const MIN_DURATION_SECONDS = 45; // change if you want
const MAX_RESULTS_TOTAL = 100;    // change if you want
const PAGE_SIZE = 25;             // YouTube search max is 50, but 25 is fine

function parseISO8601Duration(iso) {
  // Handles PT#H#M#S
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const h = parseInt(match?.[1] || "0", 10);
  const m = parseInt(match?.[2] || "0", 10);
  const s = parseInt(match?.[3] || "0", 10);
  const total = h * 3600 + m * 60 + s;
  return {
    seconds: total,
    readable:
      h > 0
        ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        : `${m}:${String(s).padStart(2, "0")}`,
  };
}

async function ytFetchJson(url) {
  const resp = await fetch(url);
  const text = await resp.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`YouTube API returned non-JSON:\n${text}`);
  }

  if (!resp.ok || json?.error) {
    const status = resp.status;
    const err = json?.error;
    const msg = err?.message || `HTTP ${status}`;
    const reasons =
      err?.errors?.map(e => `${e.reason}${e.message ? `: ${e.message}` : ""}`) || [];
    throw new Error(
      `YouTube API error (${status}): ${msg}\n` +
      (reasons.length ? `Reasons:\n- ${reasons.join("\n- ")}\n` : "") +
      `URL: ${url}`
    );
  }

  return json;
}

async function main() {
  if (!API_KEY || API_KEY === "PUT_YOUR_KEY_HERE") {
    throw new Error("Set YT_API_KEY (env var) or put your API key in the script.");
  }

  let nextPageToken = undefined;
  const videoIds = [];

  while (videoIds.length < MAX_RESULTS_TOTAL) {
    const base =
      `https://www.googleapis.com/youtube/v3/search` +
      `?key=${encodeURIComponent(API_KEY)}` +
      `&channelId=${encodeURIComponent(CHANNEL_ID)}` +
      `&part=snippet,id` +
      `&order=date` +
      `&maxResults=${PAGE_SIZE}`;

    const url = nextPageToken ? `${base}&pageToken=${encodeURIComponent(nextPageToken)}` : base;

    const data = await ytFetchJson(url);

    // Guard: items must exist
    const items = Array.isArray(data.items) ? data.items : [];
    for (const item of items) {
      if (item?.id?.kind === "youtube#video" && item?.id?.videoId) {
        videoIds.push(item.id.videoId);
      }
    }

    nextPageToken = data.nextPageToken;
    if (!nextPageToken) break;
  }

  const uniqueIds = [...new Set(videoIds)].slice(0, MAX_RESULTS_TOTAL);

  if (uniqueIds.length === 0) {
    throw new Error(
      "No video IDs were returned. If your channel has videos, this is usually an API key restriction/quota issue."
    );
  }

  // videos endpoint supports up to 50 ids per request
  const chunks = [];
  for (let i = 0; i < uniqueIds.length; i += 50) {
    chunks.push(uniqueIds.slice(i, i + 50));
  }

  const allDetails = [];
  for (const chunk of chunks) {
    const url =
      `https://www.googleapis.com/youtube/v3/videos` +
      `?key=${encodeURIComponent(API_KEY)}` +
      `&id=${encodeURIComponent(chunk.join(","))}` +
      `&part=snippet,contentDetails`;

    const details = await ytFetchJson(url);
    allDetails.push(...(details.items || []));
  }

  const filtered = allDetails
    .map(v => {
      const { seconds, readable } = parseISO8601Duration(v.contentDetails?.duration || "PT0S");
      return {
        id: v.id,
        title: v.snippet?.title || "",
        thumbnail: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || "",
        url: `https://www.youtube.com/watch?v=${v.id}`,
        durationSeconds: seconds,
        duration: readable,
      };
    })
    .filter(v => v.durationSeconds >= MIN_DURATION_SECONDS) // basic “no shorts” filter
    .slice(0, MAX_RESULTS_TOTAL);

  // Write to repo root (../videos.json from scripts/)
  const outPath = path.resolve(__dirname, "../videos.json");
  fs.writeFileSync(outPath, JSON.stringify(filtered, null, 2));
  console.log(`Wrote ${filtered.length} videos to ${outPath}`);
}

main().catch(err => {
  console.error("\n❌ build-videos.js failed:\n" + (err?.stack || err));
  process.exit(1);
});

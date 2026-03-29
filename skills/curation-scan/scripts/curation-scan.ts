/**
 * content-curation — Phase 1 API Scan
 * 一键跑完 HN + YouTube + Tavily + Twitter 四个 API 渠道
 *
 * 用法:
 *   source .claude/.env && export TAVILY_API_KEY GOOGLE_API_KEY_YOUTUBE X_CLIENT_ID X_CLIENT_SECRET && \
 *   tsx ~/.claude/skills/content-curation/scripts/curation-scan.ts
 *
 * 输出: curation/YYYY-MM-DD/{hn-raw,youtube-raw,tavily-raw,twitter-raw}.json
 *
 * WebSearch 由 Claude 对话补充，不在此脚本中
 */

import fs from "fs";
import path from "path";
import { URL, URLSearchParams } from "url";

// ─── Config ───────────────────────────────────────────────────────
const PROJECT_ROOT = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const OUT_DIR = path.join(PROJECT_ROOT, "curation", today);
const TOKEN_FILE = path.join(PROJECT_ROOT, "tmp/.twitter-tokens.json");
const WATCHLIST_FILE = path.join(PROJECT_ROOT, "curation/watchlist.json");

const YOUTUBE_KEY = process.env.GOOGLE_API_KEY_YOUTUBE || "";
const TAVILY_KEY = process.env.TAVILY_API_KEY || "";
const X_CLIENT_ID = process.env.X_CLIENT_ID || "";
const X_CLIENT_SECRET = process.env.X_CLIENT_SECRET || "";

const AI_KEYWORDS = [
  "AI", "LLM", "GPT", "Claude", "Gemini", "model", "neural", "transformer",
  "agent", "ML", "machine learning", "OpenAI", "Anthropic", "DeepSeek",
  "Mistral", "robot", "AGI", "copilot", "llama", "inference", "benchmark",
];

const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 86400000).toISOString().replace(/\.\d+Z$/, "Z");

// ─── Helpers ──────────────────────────────────────────────────────
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeJSON(filename: string, data: any) {
  fs.writeFileSync(path.join(OUT_DIR, filename), JSON.stringify(data, null, 2));
}

async function fetchJSON(url: string, opts?: RequestInit): Promise<any> {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
  return res.json();
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── 1. Hacker News ──────────────────────────────────────────────
async function scanHN() {
  console.log("\n📰 [HN] Fetching top stories...");
  const ids: number[] = await fetchJSON("https://hacker-news.firebaseio.com/v0/topstories.json");
  const top50 = ids.slice(0, 50);

  const stories: any[] = [];
  for (const id of top50) {
    try {
      const item = await fetchJSON(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      if (item?.type === "story") {
        stories.push({
          id, title: item.title || "", url: item.url || "",
          score: item.score || 0, comments: item.descendants || 0,
        });
      }
    } catch { /* skip */ }
  }

  const aiStories = stories.filter(s =>
    AI_KEYWORDS.some(k => s.title.toLowerCase().includes(k.toLowerCase()))
  ).sort((a, b) => b.score - a.score).slice(0, 15);

  writeJSON("hn-raw.json", aiStories);
  console.log(`   ✅ ${aiStories.length} AI stories (from ${stories.length} total)`);
  return aiStories;
}

// ─── 2. YouTube ──────────────────────────────────────────────────
async function scanYouTube() {
  if (!YOUTUBE_KEY) { console.log("\n🎬 [YouTube] SKIPPED (no GOOGLE_API_KEY_YOUTUBE)"); return []; }
  console.log("\n🎬 [YouTube] Scanning watchlist + keyword search...");

  // Load watchlist
  let channels: { channelId: string; label: string }[] = [];
  if (fs.existsSync(WATCHLIST_FILE)) {
    const wl = JSON.parse(fs.readFileSync(WATCHLIST_FILE, "utf-8"));
    channels = (wl.youtube || []).map((c: any) => ({ channelId: c.channelId, label: c.label }));
  } else {
    // Fallback hardcoded
    channels = [
      { channelId: "UCsBjURrPoezykLs9EqgamOA", label: "Fireship" },
      { channelId: "UCbfYPyITQ-7l4upoX8nvctg", label: "Two Minute Papers" },
      { channelId: "UCSHZKyawb77ixDdsGog4iWA", label: "Lex Fridman" },
      { channelId: "UCJIfeSCssxSC_Dhc5s7woww", label: "Matt Wolfe" },
      { channelId: "UCWN3xxRkmTPphYnPVR_JOQQ", label: "AI Explained" },
      { channelId: "UCZHmQk67mSJgfCCTn7xBfew", label: "Yannic Kilcher" },
      { channelId: "UCHBzM4FVmUQ4NeVq3Ij0KfA", label: "TheAIGRID" },
      { channelId: "UCg6gPGh8HU2U01vaFCAsvmQ", label: "Matthew Berman" },
      { channelId: "UCKNSRReFslgV1WVLbGYcXwg", label: "WorldofAI" },
    ];
  }

  const allVids: any[] = [];

  // Channel scan (1 unit each)
  for (const ch of channels) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${ch.channelId}&order=date&publishedAfter=${SEVEN_DAYS_AGO}&maxResults=3&type=video&key=${YOUTUBE_KEY}`;
      const d = await fetchJSON(url);
      for (const i of d.items || []) {
        const vid = i.id?.videoId;
        if (vid) allVids.push({
          channel: ch.label, title: i.snippet?.title || "", videoId: vid,
          date: (i.snippet?.publishedAt || "").slice(0, 10),
          url: `https://youtube.com/watch?v=${vid}`,
        });
      }
    } catch { /* skip */ }
  }
  console.log(`   Watchlist: ${allVids.length} videos from ${channels.length} channels`);

  // Keyword search (100 units each, max 5)
  const queries = [
    "AI agent March 2026", "LLM benchmark 2026", "AI jobs automation 2026",
    "AI coding tools 2026", "AGI artificial general intelligence 2026",
  ];
  for (const q of queries) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=5&publishedAfter=${SEVEN_DAYS_AGO}&key=${YOUTUBE_KEY}`;
      const d = await fetchJSON(url);
      for (const i of d.items || []) {
        const vid = i.id?.videoId;
        if (vid) allVids.push({
          channel: i.snippet?.channelTitle || "", title: i.snippet?.title || "",
          videoId: vid, date: (i.snippet?.publishedAt || "").slice(0, 10),
          url: `https://youtube.com/watch?v=${vid}`, query: q,
        });
      }
    } catch { /* skip */ }
    await sleep(200);
  }

  // Dedupe by videoId
  const seen = new Set<string>();
  const unique = allVids.filter(v => { if (seen.has(v.videoId)) return false; seen.add(v.videoId); return true; });

  writeJSON("youtube-raw.json", unique);
  console.log(`   ✅ ${unique.length} unique videos`);
  return unique;
}

// ─── 3. Tavily ───────────────────────────────────────────────────
async function scanTavily() {
  if (!TAVILY_KEY) { console.log("\n🔍 [Tavily] SKIPPED (no TAVILY_API_KEY)"); return []; }
  console.log("\n🔍 [Tavily] Running searches...");

  const queries = [
    "AI model releases breakthroughs March 2026",
    "AI coding agent autonomous programming 2026",
    "AI job replacement economy workers 2026",
    "AGI artificial general intelligence progress 2026",
    "AI regulation policy government 2026",
  ];

  const results: any[] = [];
  for (const q of queries) {
    try {
      const d = await fetchJSON("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: TAVILY_KEY, query: q, search_depth: "basic", max_results: 8, days: 7 }),
      });
      for (const r of d.results || []) {
        results.push({
          query: q, title: r.title || "", url: r.url || "",
          content: (r.content || "").slice(0, 300), score: r.score || 0,
        });
      }
      console.log(`   [${q.slice(0, 40)}] → ${(d.results || []).length} results`);
    } catch (e) {
      console.log(`   ERROR: ${q}: ${e}`);
    }
  }

  writeJSON("tavily-raw.json", results);
  console.log(`   ✅ ${results.length} total results`);
  return results;
}

// ─── 4. Twitter ──────────────────────────────────────────────────
async function refreshTwitterToken(): Promise<string | null> {
  if (!fs.existsSync(TOKEN_FILE)) {
    console.log("   ⚠️  No token file. Run: tsx ~/.claude/skills/crawl-twitter/scripts/twitter-oauth.ts");
    return null;
  }
  const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8"));
  const expiresAt = new Date(tokens.expires_at).getTime();

  if (Date.now() < expiresAt - 5 * 60 * 1000) return tokens.access_token;

  // Refresh
  if (!tokens.refresh_token || !X_CLIENT_ID) return tokens.access_token; // try anyway
  console.log("   🔄 Refreshing token...");
  try {
    const res = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString("base64"),
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }).toString(),
    });
    const d = await res.json() as any;
    if (d.error) { console.log("   ❌ Refresh failed:", d.error); return tokens.access_token; }
    const newTokens = {
      access_token: d.access_token, refresh_token: d.refresh_token,
      expires_at: new Date(Date.now() + d.expires_in * 1000).toISOString(),
      scope: d.scope, token_type: d.token_type,
    };
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(newTokens, null, 2));
    console.log("   ✅ Token refreshed");
    return newTokens.access_token;
  } catch { return tokens.access_token; }
}

async function scanTwitter() {
  console.log("\n🐦 [Twitter] Scanning watchlist + keywords...");
  const token = await refreshTwitterToken();
  if (!token) { console.log("   SKIPPED"); writeJSON("twitter-raw.json", []); return []; }

  const headers = { Authorization: `Bearer ${token}` };

  // Load watchlist
  let twitterUsers: string[] = [];
  if (fs.existsSync(WATCHLIST_FILE)) {
    const wl = JSON.parse(fs.readFileSync(WATCHLIST_FILE, "utf-8"));
    twitterUsers = (wl.twitter || []).map((u: any) => u.username);
  } else {
    twitterUsers = ["karpathy", "OpenAI", "AnthropicAI", "GoogleDeepMind", "elonmusk",
      "sama", "svpino", "GaryMarcus", "fchollet", "hardmaru", "ylecun", "AndrewYNg", "jimfan"];
  }

  const allTweets: any[] = [];

  // Watchlist groups
  const groups: string[][] = [];
  for (let i = 0; i < twitterUsers.length; i += 4) groups.push(twitterUsers.slice(i, i + 4));

  for (const group of groups) {
    const q = group.map(u => `from:${u}`).join(" OR ");
    try {
      const url = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(q)}&tweet.fields=public_metrics,created_at,author_id&expansions=author_id&user.fields=name,username,public_metrics&max_results=20&sort_order=recency`;
      const d = await fetchJSON(url, { headers });
      const users: Record<string, any> = {};
      for (const u of d.includes?.users || []) users[u.id] = u;
      for (const t of d.data || []) {
        const user = users[t.author_id] || {};
        allTweets.push({
          author: user.name || "", username: `@${user.username || ""}`,
          text: t.text || "", created_at: t.created_at || "",
          metrics: t.public_metrics || {}, id: t.id || "",
          url: `https://x.com/${user.username || ""}/status/${t.id}`,
        });
      }
      console.log(`   [watchlist: ${group.join(",")}] → ${(d.data || []).length} tweets`);
    } catch (e) { console.log(`   ERROR watchlist: ${e}`); }
    await sleep(1000);
  }

  // Keyword search
  const keywords = [
    "AI agent coding autonomous", "AI replacing jobs layoffs 2026",
    "LLM GPT Claude new model", "AGI breakthrough",
    "AI regulation Pentagon military", "DeepSeek Qwen open source model",
  ];
  for (const kw of keywords) {
    try {
      const url = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(kw)}&tweet.fields=public_metrics,created_at,author_id&expansions=author_id&user.fields=name,username&max_results=20&sort_order=relevancy`;
      const d = await fetchJSON(url, { headers });
      const users: Record<string, any> = {};
      for (const u of d.includes?.users || []) users[u.id] = u;
      for (const t of d.data || []) {
        const user = users[t.author_id] || {};
        allTweets.push({
          author: user.name || "", username: `@${user.username || ""}`,
          text: t.text || "", created_at: t.created_at || "",
          metrics: t.public_metrics || {}, id: t.id || "",
          url: `https://x.com/${user.username || ""}/status/${t.id}`, query: kw,
        });
      }
      console.log(`   [search: ${kw.slice(0, 30)}] → ${(d.data || []).length} tweets`);
    } catch (e) { console.log(`   ERROR search: ${e}`); }
    await sleep(1000);
  }

  // Dedupe
  const seen = new Set<string>();
  const unique = allTweets.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
  unique.sort((a, b) => (b.metrics?.impression_count || 0) - (a.metrics?.impression_count || 0));

  writeJSON("twitter-raw.json", unique);
  console.log(`   ✅ ${unique.length} unique tweets`);
  return unique;
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 Content Curation Scan — ${today}`);
  console.log(`   Output: ${OUT_DIR}`);
  ensureDir(OUT_DIR);

  const results = await Promise.allSettled([scanHN(), scanYouTube(), scanTavily(), scanTwitter()]);

  const summary = {
    date: today,
    scan_time: new Date().toISOString(),
    channels: {
      hacker_news: { status: results[0].status === "fulfilled" ? "ok" : "error", file: "hn-raw.json" },
      youtube: { status: results[1].status === "fulfilled" ? "ok" : "error", file: "youtube-raw.json" },
      tavily: { status: results[2].status === "fulfilled" ? "ok" : "error", file: "tavily-raw.json" },
      twitter: { status: results[3].status === "fulfilled" ? "ok" : "error", file: "twitter-raw.json" },
    },
  };
  writeJSON("api-scan-summary.json", summary);

  console.log(`\n✅ Scan complete! Raw data in: ${OUT_DIR}`);
  console.log(`   Next: Claude reads raw data + WebSearch → generates scan.json + summary.md`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

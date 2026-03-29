/**
 * XHS Comment Collection — MediaCrawler approach
 *
 * 1. Inject stealth.min.js to hide Playwright
 * 2. Use window.mnsv2 for signing (XHS's own function)
 * 3. Build XYS_ prefixed x-s header
 * 4. Build x-s-common with proper metadata
 * 5. Make signed API calls via httpx-style requests
 */
import { chromium, type Page, type BrowserContext } from "playwright";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, "..", "profiles", "browser-data");
const TMP = join(__dirname, "..", "tmp");
const STEALTH_JS = join(__dirname, "stealth.min.js");
const OUTPUT_FILE = `${TMP}/xhs-comments-all.json`;
const MAX_POSTS = 10;
const DELAY_MS = 2000;

// Custom Base64 character table (from MediaCrawler)
const BASE64_CHARS = "ZmserbBoHQtNP+wOcza/LpngG8yJq42KWYj0DSfdikx3VT16IlUAFM97hECvuRX5";
const STD_BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function customB64Encode(input: string): string {
  const buf = Buffer.from(input, "utf-8");
  const std = buf.toString("base64").replace(/=+$/, "");
  let result = "";
  for (const ch of std) {
    const idx = STD_BASE64.indexOf(ch);
    result += idx >= 0 ? BASE64_CHARS[idx] : ch;
  }
  return result;
}

// CRC32 variant (from MediaCrawler's mrc function)
function mrc(input: string): number {
  // Standard CRC32 table
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table.push(c >>> 0);
  }

  let crc = 0xFFFFFFFF;
  const str = input.substring(0, 57);
  for (let i = 0; i < str.length; i++) {
    crc = (table[(crc ^ str.charCodeAt(i)) & 0xFF]! ^ (crc >>> 8)) >>> 0;
  }
  return ((crc ^ 0xFFFFFFFF) ^ 3988292384) >>> 0;
}

function getTraceId(): string {
  return crypto.randomBytes(8).toString("hex");
}

interface Comment {
  id: string;
  author: string;
  avatar_url: string;
  text: string;
  time: string;
  likes: number;
  ip_location: string;
  replies: Comment[];
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms + Math.random() * 500));
}

// Build x-s header using mnsv2 result
function buildXs(mnsv2Result: string): string {
  const payload = JSON.stringify({
    x0: "4.2.1",
    x1: "xhs-pc-web",
    x2: "Mac OS",
    x3: mnsv2Result,
    x4: "object",
  });
  return "XYS_" + customB64Encode(payload);
}

// Build x-s-common header
function buildXsCommon(a1: string, b1: string, xs: string, xt: string): string {
  const payload = JSON.stringify({
    s0: 3,
    s1: "",
    x0: "1",
    x1: "4.2.2",
    x2: "Mac OS",
    x3: "xhs-pc-web",
    x4: "4.74.0",
    x5: a1,
    x6: xt,
    x7: xs,
    x8: b1,
    x9: mrc(xt + xs + b1),
    x10: 154,
    x11: "normal",
  });
  return customB64Encode(payload);
}

// Sign a request using the page's window.mnsv2
async function signRequest(
  page: Page,
  uri: string,
  data: any,
  a1: string,
  b1: string,
): Promise<Record<string, string>> {
  // Build sign string: for GET requests, it's just the full URI with params
  const signStr = uri;
  const md5Str = crypto.createHash("md5").update(signStr).digest("hex");

  // Call window.mnsv2 in browser context
  const mnsv2Result = await page.evaluate(
    ({ signStr, md5Str }) => {
      const w = window as any;
      if (typeof w.mnsv2 !== "function") {
        throw new Error("window.mnsv2 not found");
      }
      return w.mnsv2(signStr, md5Str);
    },
    { signStr, md5Str },
  );

  if (!mnsv2Result) {
    throw new Error("mnsv2 returned empty result");
  }

  const xt = String(Date.now());
  const xs = buildXs(mnsv2Result);
  const xsCommon = buildXsCommon(a1, b1, xs, xt);

  return {
    "x-s": xs,
    "x-t": xt,
    "x-s-common": xsCommon,
    "x-b3-traceid": getTraceId(),
  };
}

async function main() {
  fs.mkdirSync(TMP, { recursive: true });

  // Read stealth.min.js
  const stealthJs = fs.readFileSync(STEALTH_JS, "utf-8");
  console.log(`Loaded stealth.min.js (${stealthJs.length} bytes)`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  });

  // Note: stealth.min.js will be injected per-page, not globally
  // (global injection can interfere with creator center)

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  // ============ Step 1: Get posts from creator center ============
  console.log("=== Step 1: Getting posts from creator center ===");
  let postsApiData: any = null;
  page.on("response", async (response) => {
    if (response.url().includes("/api/galaxy/") && response.url().includes("posted")) {
      try { postsApiData = await response.json(); } catch {}
    }
  });

  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", { timeout: 60000, waitUntil: "domcontentloaded" });
  await delay(3000);

  if (page.url().includes("login")) {
    console.log("Creator center needs login. Please scan QR code in the browser...");
    await page.screenshot({ path: `${TMP}/xhs-creator-login.png` });
    // Wait up to 3 minutes for login
    for (let i = 0; i < 60; i++) {
      await delay(3000);
      if (!page.url().includes("login")) {
        console.log("Creator center login detected!");
        await delay(2000);
        break;
      }
      if (i % 10 === 0) process.stdout.write(".");
    }
    // Navigate again after login
    await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", { timeout: 60000, waitUntil: "domcontentloaded" });
    await delay(3000);
  }

  try {
    await page.getByText("笔记管理").first().click({ timeout: 15000 });
  } catch {
    console.log("Could not find 笔记管理. Aborting.");
    await context.close();
    return;
  }
  await delay(3000);

  if (!postsApiData?.data?.notes) {
    console.log("Failed to get posts. Aborting.");
    await context.close();
    return;
  }

  const posts = postsApiData.data.notes.slice(0, MAX_POSTS).map((n: any) => ({
    note_id: n.id || n.note_id,
    title: n.display_title || n.title || "(untitled)",
    comments_count: n.comments_count || 0,
    views: n.view_count || 0,
    likes: n.likes || 0,
    collects: n.collected_count || 0,
    shares: n.shared_count || 0,
    publish_time: n.time || "",
    type: n.type || "normal",
  }));

  console.log(`Got ${posts.length} posts:`);
  posts.forEach((p: any, i: number) =>
    console.log(`  ${i + 1}. ${p.title} (comments: ${p.comments_count})`),
  );

  // ============ Step 2: Navigate to XHS main site to get signing context ============
  console.log("\n=== Step 2: Loading XHS main site for signing ===");

  // Inject stealth.min.js for the main site page
  await page.addInitScript(stealthJs);

  await page.goto("https://www.xiaohongshu.com/explore", { timeout: 60000, waitUntil: "domcontentloaded" });
  await delay(5000);

  // Check for mnsv2
  const hasMnsv2 = await page.evaluate(() => typeof (window as any).mnsv2 === "function");
  console.log(`window.mnsv2 available: ${hasMnsv2}`);

  if (!hasMnsv2) {
    console.log("mnsv2 not found. Waiting for XHS scripts to load...");
    await delay(5000);
    const retry = await page.evaluate(() => typeof (window as any).mnsv2 === "function");
    if (!retry) {
      console.log("mnsv2 still not available. Aborting.");
      await context.close();
      return;
    }
  }

  // Get cookies and localStorage
  const cookies = await context.cookies(["https://www.xiaohongshu.com"]);
  const a1 = cookies.find(c => c.name === "a1")?.value || "";
  const webSession = cookies.find(c => c.name === "web_session")?.value || "";
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join("; ");

  // Get b1 from localStorage
  const b1 = await page.evaluate(() => {
    try { return localStorage.getItem("b1") || ""; } catch { return ""; }
  });

  console.log(`a1: ${a1 ? a1.substring(0, 15) + "..." : "MISSING"}`);
  console.log(`web_session: ${webSession ? "present" : "MISSING"}`);
  console.log(`b1: ${b1 ? b1.substring(0, 15) + "..." : "MISSING"}`);

  if (!a1) {
    console.log("Not logged in. Please scan QR code...");
    await page.screenshot({ path: `${TMP}/xhs-login-needed.png` });
    // Wait for login
    for (let i = 0; i < 60; i++) {
      await delay(3000);
      const newCookies = await context.cookies(["https://www.xiaohongshu.com"]);
      if (newCookies.find(c => c.name === "web_session")) {
        console.log("Login successful!");
        await page.reload();
        await delay(5000);
        break;
      }
    }
  }

  // ============ Step 3: Collect comments ============
  console.log("\n=== Step 3: Collecting comments via signed API ===");

  const allResults: any[] = [];

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    console.log(`\n--- [${i + 1}/${posts.length}] ${post.title} (${post.comments_count} comments) ---`);

    if (post.comments_count === 0) {
      allResults.push({
        ...post,
        post_url: `https://www.xiaohongshu.com/explore/${post.note_id}`,
        total_comments_collected: 0,
        total_replies: 0,
        comments: [],
      });
      continue;
    }

    try {
      const comments = await collectComments(page, post.note_id, a1, b1, cookieString);
      const totalReplies = comments.reduce((s, c) => s + c.replies.length, 0);

      allResults.push({
        ...post,
        post_url: `https://www.xiaohongshu.com/explore/${post.note_id}`,
        total_comments_collected: comments.length,
        total_replies: totalReplies,
        comments,
      });

      console.log(`  Done: ${comments.length} comments, ${totalReplies} replies`);
    } catch (err) {
      console.log(`  Error: ${err instanceof Error ? err.message : err}`);
      allResults.push({
        ...post,
        post_url: `https://www.xiaohongshu.com/explore/${post.note_id}`,
        total_comments_collected: 0,
        total_replies: 0,
        comments: [],
        error: String(err),
      });
    }

    if (i < posts.length - 1) await delay(DELAY_MS);
  }

  // ============ Step 4: Save results ============
  const result = {
    platform: "xhs",
    collected_at: new Date().toISOString(),
    total_posts: allResults.length,
    total_comments: allResults.reduce((s, p) => s + p.total_comments_collected, 0),
    total_replies: allResults.reduce((s, p) => s + p.total_replies, 0),
    posts: allResults,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  console.log(`\n=== Complete ===`);
  console.log(`Posts: ${result.total_posts}`);
  console.log(`Comments: ${result.total_comments}`);
  console.log(`Replies: ${result.total_replies}`);
  console.log(`Output: ${OUTPUT_FILE}`);

  await context.close();
}

// Make API call INSIDE the browser (RPA approach — same as 蚁小二 etc.)
// This uses the browser's own network stack, TLS fingerprint, and cookies
async function browserFetch(
  page: Page,
  uri: string,
): Promise<{ status: number; data: any }> {
  return page.evaluate(async (apiUri: string) => {
    const url = `https://edith.xiaohongshu.com${apiUri}`;
    try {
      const res = await fetch(url, {
        credentials: "include",
        headers: {
          "accept": "application/json, text/plain, */*",
          "referer": "https://www.xiaohongshu.com/",
        },
      });
      const data = await res.json();
      return { status: res.status, data };
    } catch (e: any) {
      return { status: -1, data: { error: e.message } };
    }
  }, uri);
}

async function collectComments(
  page: Page,
  noteId: string,
  a1: string,
  b1: string,
  cookieString: string,
): Promise<Comment[]> {
  const comments = new Map<string, Comment & { _subCount: number }>();
  let cursor = "";
  let hasMore = true;
  let pageNum = 0;

  while (hasMore && pageNum < 50) {
    pageNum++;
    const uri = `/api/sns/web/v2/comment/page?note_id=${noteId}&cursor=${cursor}&image_formats=webp`;

    try {
      const { status, data } = await browserFetch(page, uri);

      if (status === 461) {
        console.log(`  461 on page ${pageNum}. Stopping.`);
        break;
      }

      if (status !== 200) {
        console.log(`  HTTP ${status} on page ${pageNum}`);
        break;
      }

      if (data?.code !== 0 || !data?.data?.comments) {
        console.log(`  API error: ${data?.msg || "unknown"} (code: ${data?.code})`);
        break;
      }

      for (const c of data.data.comments) {
        if (!comments.has(c.id)) {
          comments.set(c.id, { ...parseComment(c), _subCount: c.sub_comment_count || 0 });
        }
      }

      cursor = data.data.cursor || "";
      hasMore = data.data.has_more ?? false;

      if (pageNum % 3 === 0) {
        process.stdout.write(`  p${pageNum}(${comments.size}) `);
      }
    } catch (err) {
      console.log(`  Fetch error: ${err instanceof Error ? err.message : err}`);
      break;
    }

    await delay(DELAY_MS);
  }

  if (pageNum > 3) console.log();

  // Fetch sub-comments
  for (const [id, comment] of comments) {
    if (comment._subCount > comment.replies.length) {
      let subCursor = "";
      let subMore = true;
      let subPageNum = 0;

      while (subMore && subPageNum < 20) {
        subPageNum++;
        const uri = `/api/sns/web/v2/comment/sub/page?note_id=${noteId}&root_comment_id=${id}&num=10&cursor=${subCursor}&image_formats=webp`;

        try {
          const { status, data } = await browserFetch(page, uri);

          if (status !== 200) break;

          if (data?.data?.comments) {
            for (const sc of data.data.comments) {
              if (!comment.replies.find(r => r.id === sc.id)) {
                comment.replies.push(parseComment(sc));
              }
            }
            subCursor = data.data.cursor || "";
            subMore = data.data.has_more ?? false;
          } else {
            subMore = false;
          }
        } catch {
          subMore = false;
        }
        await delay(DELAY_MS);
      }
    }
  }

  return Array.from(comments.values()).map(({ _subCount, ...c }) => c);
}

function parseComment(raw: any): Comment {
  return {
    id: raw.id || "",
    author: raw.user_info?.nickname || "",
    avatar_url: raw.user_info?.image || "",
    text: raw.content || "",
    time: raw.create_time ? String(raw.create_time) : "",
    likes: raw.like_count || 0,
    ip_location: raw.ip_location || "",
    replies: (raw.sub_comments || []).map((sc: any) => parseComment(sc)),
  };
}

main().catch(console.error);

/**
 * XHS Comment Collection — Hybrid approach
 * 1. Launch browser (Playwright) to extract cookies + get post list from creator center
 * 2. Use cookies to call comment API directly via Node.js fetch (no browser navigation to main site)
 */
import { chromium } from "playwright";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, "..", "profiles", "browser-data");
const TMP = join(__dirname, "..", "tmp");
const OUTPUT_FILE = `${TMP}/xhs-comments-all.json`;
const MAX_POSTS = 10;
const DELAY_MS = 2000;

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

// XHS signing algorithm (ported from ReaJason/xhs)
const CUSTOM_ALPHABET = "A4NjFqYu5wPHsO0XTdDgMa2r1ZQocVte9UJBvk6/7=yRnhISGKblCWi+LpfE8xzm3";
const STANDARD_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

function customBase64Encode(input: string): string {
  const base64 = Buffer.from(input).toString("base64");
  let result = "";
  for (const ch of base64) {
    const idx = STANDARD_ALPHABET.indexOf(ch);
    result += idx >= 0 ? CUSTOM_ALPHABET[idx] : ch;
  }
  return result;
}

function sign(uri: string, data?: string): { "x-s": string; "x-t": string } {
  const timestamp = String(Date.now());
  const payload = `${timestamp}test${uri}${data || ""}`;
  const md5 = crypto.createHash("md5").update(payload).digest("hex");
  const xs = customBase64Encode(md5);
  return { "x-s": xs, "x-t": timestamp };
}

async function main() {
  fs.mkdirSync(TMP, { recursive: true });

  console.log("Launching browser to extract cookies and get posts...");
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  // ============ Step 1: Get posts from creator center ============
  console.log("=== Step 1: Fetching posts from creator center ===");

  let postsApiData: any = null;
  page.on("response", async (response) => {
    if (response.url().includes("/api/galaxy/") && response.url().includes("posted")) {
      try { postsApiData = await response.json(); } catch {}
    }
  });

  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official");
  await delay(3000);

  if (page.url().includes("login")) {
    console.log("Not logged in. Please log in first.");
    await context.close();
    return;
  }

  await page.getByText("笔记管理").first().click();
  await delay(3000);

  if (!postsApiData?.data?.notes) {
    console.log("Failed to get posts.");
    await context.close();
    return;
  }

  const posts = postsApiData.data.notes.slice(0, MAX_POSTS).map((n: any) => ({
    note_id: n.id || n.note_id,
    title: n.display_title || n.title || "(untitled)",
    views: n.view_count || 0,
    likes: n.likes || 0,
    comments_count: n.comments_count || 0,
    collects: n.collected_count || 0,
    shares: n.shared_count || 0,
    publish_time: n.time || "",
    type: n.type || "normal",
  }));

  console.log(`Got ${posts.length} posts:`);
  posts.forEach((p: any, i: number) => {
    console.log(`  ${i + 1}. ${p.title} (comments: ${p.comments_count})`);
  });

  // ============ Step 2: Extract cookies ============
  console.log("\n=== Step 2: Extracting cookies ===");
  const cookies = await context.cookies(["https://www.xiaohongshu.com", "https://edith.xiaohongshu.com"]);
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  const a1Cookie = cookies.find(c => c.name === "a1")?.value || "";
  const webSession = cookies.find(c => c.name === "web_session")?.value || "";

  console.log(`Cookies extracted: ${cookies.length} total`);
  console.log(`  a1: ${a1Cookie ? a1Cookie.substring(0, 20) + "..." : "MISSING"}`);
  console.log(`  web_session: ${webSession ? webSession.substring(0, 20) + "..." : "MISSING"}`);

  if (!a1Cookie) {
    console.log("ERROR: a1 cookie not found. Need to login to main site.");
    // Try to get cookies by navigating to the main site briefly
    // Even if 461 on API, the main page itself might set cookies
    await page.goto("https://www.xiaohongshu.com");
    await delay(3000);
    const newCookies = await context.cookies(["https://www.xiaohongshu.com"]);
    const newA1 = newCookies.find(c => c.name === "a1")?.value;
    if (newA1) {
      console.log(`Got a1 from main site: ${newA1.substring(0, 20)}...`);
    } else {
      console.log("Still no a1. Aborting.");
      await context.close();
      return;
    }
  }

  // Close browser - we don't need it anymore
  await context.close();
  console.log("Browser closed. Using API directly...");

  // ============ Step 3: Collect comments via direct API ============
  console.log("\n=== Step 3: Collecting comments via API ===");

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

    const comments = await collectCommentsViaApi(post.note_id, cookieString);
    const totalReplies = comments.reduce((s, c) => s + c.replies.length, 0);

    allResults.push({
      ...post,
      post_url: `https://www.xiaohongshu.com/explore/${post.note_id}`,
      total_comments_collected: comments.length,
      total_replies: totalReplies,
      comments,
    });

    console.log(`  Done: ${comments.length} comments, ${totalReplies} replies`);

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
}

async function collectCommentsViaApi(noteId: string, cookieString: string): Promise<Comment[]> {
  const comments = new Map<string, Comment & { _subCount: number }>();
  let cursor = "";
  let hasMore = true;
  let page = 0;

  // Fetch main comments
  while (hasMore && page < 50) {
    page++;
    const uri = `/api/sns/web/v2/comment/page?note_id=${noteId}&cursor=${cursor}&image_formats=webp`;
    const headers = sign(uri);

    try {
      const res = await fetch(`https://edith.xiaohongshu.com${uri}`, {
        headers: {
          ...headers,
          "cookie": cookieString,
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
          "referer": "https://www.xiaohongshu.com/",
          "origin": "https://www.xiaohongshu.com",
          "accept": "application/json, text/plain, */*",
        },
      });

      if (res.status === 461) {
        console.log(`  API returned 461 (page ${page}). Signing may be wrong.`);
        break;
      }

      if (!res.ok) {
        console.log(`  API returned ${res.status} (page ${page})`);
        break;
      }

      const data = await res.json() as any;
      if (data?.data?.comments) {
        for (const c of data.data.comments) {
          if (!comments.has(c.id)) {
            comments.set(c.id, { ...parseComment(c), _subCount: c.sub_comment_count || 0 });
          }
        }
        cursor = data.data.cursor || "";
        hasMore = data.data.has_more ?? false;
        if (page % 5 === 0) {
          process.stdout.write(`  page${page}(${comments.size}) `);
        }
      } else {
        hasMore = false;
      }
    } catch (err) {
      console.log(`  Error: ${err instanceof Error ? err.message : err}`);
      break;
    }

    await delay(DELAY_MS);
  }

  // Fetch sub-comments
  for (const [id, comment] of comments) {
    if (comment._subCount > comment.replies.length) {
      let subCursor = "";
      let subMore = true;
      let subPage = 0;

      while (subMore && subPage < 20) {
        subPage++;
        const uri = `/api/sns/web/v2/comment/sub/page?note_id=${noteId}&root_comment_id=${id}&num=10&cursor=${subCursor}&image_formats=webp`;
        const headers = sign(uri);

        try {
          const res = await fetch(`https://edith.xiaohongshu.com${uri}`, {
            headers: {
              ...headers,
              "cookie": cookieString,
              "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
              "referer": "https://www.xiaohongshu.com/",
              "origin": "https://www.xiaohongshu.com",
              "accept": "application/json, text/plain, */*",
            },
          });

          if (!res.ok) break;

          const data = await res.json() as any;
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

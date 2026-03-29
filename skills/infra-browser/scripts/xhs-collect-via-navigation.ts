/**
 * XHS Comment Collection — Navigation + Response Interception
 *
 * Strategy: Navigate to each post page, let XHS's own SDK make the API calls,
 * intercept the responses. This is the same approach as 蚁小二/新榜 RPA tools.
 *
 * No signing needed — the browser handles everything natively.
 */
import { chromium, type Page, type BrowserContext } from "playwright";
import * as fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, "..", "profiles", "browser-data");
const TMP = join(__dirname, "..", "tmp");
const STEALTH_JS = join(__dirname, "stealth.min.js");
const OUTPUT_FILE = `${TMP}/xhs-comments-all.json`;
const MAX_POSTS = 10;

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

async function main() {
  fs.mkdirSync(TMP, { recursive: true });
  const stealthJs = fs.readFileSync(STEALTH_JS, "utf-8");

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
  console.log("=== Step 1: Getting posts from creator center ===");
  let postsApiData: any = null;
  page.on("response", async (response) => {
    if (response.url().includes("/api/galaxy/") && response.url().includes("posted")) {
      try { postsApiData = await response.json(); } catch {}
    }
  });

  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
    timeout: 60000, waitUntil: "domcontentloaded",
  });
  await delay(3000);

  if (page.url().includes("login")) {
    console.log("Creator center needs login. Please scan QR code...");
    for (let i = 0; i < 60; i++) {
      await delay(3000);
      if (!page.url().includes("login")) {
        console.log("Login detected!");
        await delay(2000);
        break;
      }
      if (i % 10 === 0 && i > 0) process.stdout.write(".");
    }
    await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
      timeout: 60000, waitUntil: "domcontentloaded",
    });
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

  // ============ Step 2: Collect comments by navigating to each post ============
  console.log("\n=== Step 2: Collecting comments via page navigation ===");

  // Inject stealth.min.js for XHS main site
  await page.addInitScript(stealthJs);

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
      const comments = await collectCommentsViaNavigation(page, post.note_id);
      const totalReplies = comments.reduce((s, c) => s + c.replies.length, 0);

      allResults.push({
        ...post,
        post_url: `https://www.xiaohongshu.com/explore/${post.note_id}`,
        total_comments_collected: comments.length,
        total_replies: totalReplies,
        comments,
      });

      console.log(`  Collected: ${comments.length} comments, ${totalReplies} replies`);
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

    if (i < posts.length - 1) await delay(2000);
  }

  // ============ Step 3: Save results ============
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

async function collectCommentsViaNavigation(
  page: Page,
  noteId: string,
): Promise<Comment[]> {
  const collectedComments: Comment[] = [];
  const commentIds = new Set<string>();
  let got461 = false;
  let lastCursor = "";
  let hasMore = false;

  // Set up response interception for comment API
  const commentHandler = async (response: any) => {
    const url = response.url();
    if (!url.includes("/api/sns/web/v2/comment/page") || url.includes("/sub/")) return;
    if (response.status() === 461) { got461 = true; return; }

    try {
      const data = await response.json();
      if (data?.data?.comments) {
        for (const c of data.data.comments) {
          if (!commentIds.has(c.id)) {
            commentIds.add(c.id);
            collectedComments.push(parseComment(c));
          }
        }
        lastCursor = data.data.cursor || "";
        hasMore = data.data.has_more ?? false;
      }
    } catch {}
  };

  page.on("response", commentHandler);

  // Navigate to the post
  await page.goto(`https://www.xiaohongshu.com/explore/${noteId}`, {
    timeout: 30000,
    waitUntil: "domcontentloaded",
  });
  await delay(5000);

  if (got461) {
    console.log("  Got 461 on initial load");
    page.off("response", commentHandler);
    return collectedComments;
  }

  console.log(`  Initial load: ${collectedComments.length} comments`);

  // Scroll down in the comment section to load more
  // XHS loads comments lazily as you scroll the comment panel
  let scrollAttempts = 0;
  const maxScrollAttempts = 30;

  while (scrollAttempts < maxScrollAttempts && !got461) {
    const prevCount = collectedComments.length;

    // Scroll the comment container
    await page.evaluate(() => {
      // Try multiple selectors for the comment scroll container
      const selectors = [
        ".note-scroller",
        ".comments-container",
        '[class*="comment"]',
        ".note-content",
        "#noteContainer",
      ];
      let scrolled = false;
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.scrollHeight > el.clientHeight) {
          el.scrollBy(0, 500);
          scrolled = true;
          break;
        }
      }
      // Fallback: scroll the whole page
      if (!scrolled) {
        window.scrollBy(0, 500);
      }
    });

    await delay(1500);
    scrollAttempts++;

    if (collectedComments.length > prevCount) {
      console.log(`  Scroll ${scrollAttempts}: ${collectedComments.length} comments`);
      scrollAttempts = 0; // Reset counter when we get new data
    }

    // If we haven't gotten new comments in 5 scroll attempts, try clicking "load more"
    if (scrollAttempts >= 5) {
      const clickedMore = await page.evaluate(() => {
        const btns = document.querySelectorAll('[class*="more"], [class*="load"]');
        for (const btn of btns) {
          if (btn.textContent?.includes("更多") || btn.textContent?.includes("展开")) {
            (btn as HTMLElement).click();
            return true;
          }
        }
        return false;
      });
      if (!clickedMore) break; // Nothing more to load
      await delay(2000);
    }
  }

  page.off("response", commentHandler);

  // Now collect sub-comments by clicking "展开回复" buttons
  await collectSubComments(page, collectedComments, commentIds);

  return collectedComments;
}

async function collectSubComments(
  page: Page,
  comments: Comment[],
  commentIds: Set<string>,
): Promise<void> {
  // Set up interception for sub-comment responses
  const subCommentHandler = async (response: any) => {
    const url = response.url();
    if (!url.includes("/api/sns/web/v2/comment/sub/page")) return;
    try {
      const data = await response.json();
      if (data?.data?.comments) {
        // Find the parent comment from the URL
        const match = url.match(/root_comment_id=([^&]+)/);
        const rootId = match?.[1];
        if (rootId) {
          const parent = comments.find(c => c.id === rootId);
          if (parent) {
            for (const sc of data.data.comments) {
              if (!parent.replies.find(r => r.id === sc.id)) {
                parent.replies.push(parseComment(sc));
              }
            }
          }
        }
      }
    } catch {}
  };

  page.on("response", subCommentHandler);

  // Click all "展开回复" / "查看更多回复" buttons
  let expandAttempts = 0;
  while (expandAttempts < 20) {
    const clicked = await page.evaluate(() => {
      const allEls = document.querySelectorAll('span, div, button, a');
      for (const el of allEls) {
        const text = el.textContent?.trim() || "";
        if (
          (text.includes("展开") && text.includes("回复")) ||
          text.includes("查看更多回复") ||
          text.match(/展开\d+条回复/)
        ) {
          (el as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (!clicked) break;
    expandAttempts++;
    await delay(2000);
  }

  page.off("response", subCommentHandler);
}

main().catch(console.error);

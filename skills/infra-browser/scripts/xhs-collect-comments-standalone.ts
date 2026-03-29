/**
 * XHS Comment Collection — Standalone (no CDP port, no dev-browser server)
 *
 * Launches a clean browser like Postudio does, avoiding 461 detection.
 * Reuses the same profile directory for login persistence.
 */
import { chromium, type Page } from "playwright";
import * as fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, "..", "profiles", "browser-data");
const TMP = join(__dirname, "..", "tmp");
const OUTPUT_FILE = `${TMP}/xhs-comments-all.json`;
const MAX_POSTS = 10;
const DELAY_MS = 1500;

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

async function main() {
  fs.mkdirSync(TMP, { recursive: true });

  console.log("Launching browser (no CDP port)...");
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: "chrome",
    args: [
      "--disable-blink-features=AutomationControlled",
    ],
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  // ============ Step 1: Get post list from creator center ============
  console.log("=== Step 1: Fetching recent posts from creator center ===");

  let postsApiData: any = null;
  page.on("response", async (response) => {
    if (response.url().includes("/api/galaxy/") && response.url().includes("posted")) {
      try { postsApiData = await response.json(); } catch {}
    }
  });

  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official");
  await delay(3000);

  if (page.url().includes("login")) {
    console.log("Creator center not logged in. Please log in first.");
    await context.close();
    return;
  }

  await page.getByText("笔记管理").first().click();
  await delay(3000);

  if (!postsApiData?.data?.notes) {
    console.log("Could not get posts API data. Trying direct navigation...");
    await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official");
    await delay(2000);
    await page.getByText("笔记管理").first().click();
    await delay(3000);
  }

  if (!postsApiData?.data?.notes) {
    console.log("Failed to get posts. Aborting.");
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
    console.log(`  ${i + 1}. ${p.title} (views:${p.views} comments:${p.comments_count} likes:${p.likes})`);
  });

  // ============ Step 2: Collect comments from each post ============
  console.log("\n=== Step 2: Collecting comments ===");

  const allResults: any[] = [];

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    console.log(`\n--- [${i + 1}/${posts.length}] ${post.title} (${post.comments_count} comments) ---`);

    if (post.comments_count === 0) {
      console.log("  Skipping (0 comments)");
      allResults.push({
        ...post,
        post_url: `https://www.xiaohongshu.com/explore/${post.note_id}`,
        total_comments_collected: 0,
        total_replies: 0,
        comments: [],
      });
      continue;
    }

    const comments = await collectCommentsFromPage(page, post.note_id);
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

async function collectCommentsFromPage(page: Page, noteId: string): Promise<Comment[]> {
  const comments = new Map<string, Comment & { _subCount: number }>();
  let lastHasMore = false;

  const handler = async (response: any) => {
    const url = response.url();

    // Main comment API
    if (url.includes("/api/sns/web/v2/comment/page") && !url.includes("/sub/")) {
      try {
        const data = await response.json();
        if (data?.data?.comments) {
          for (const c of data.data.comments) {
            if (!comments.has(c.id)) {
              comments.set(c.id, { ...parseComment(c), _subCount: c.sub_comment_count || 0 });
            }
          }
          lastHasMore = data.data.has_more ?? false;
        }
      } catch {}
    }

    // Sub-comment API
    if (url.includes("/api/sns/web/v2/comment/sub/page") || url.includes("/api/sns/web/v1/comment/sub/page")) {
      try {
        const data = await response.json();
        if (data?.data?.comments) {
          const params = new URL(url).searchParams;
          const rootId = params.get("root_comment_id") || "";
          const parent = comments.get(rootId);
          if (parent) {
            for (const sc of data.data.comments) {
              if (!parent.replies.find(r => r.id === sc.id)) {
                parent.replies.push(parseComment(sc));
              }
            }
          }
        }
      } catch {}
    }
  };

  page.on("response", handler);

  // Navigate to post
  let got461 = false;
  const detect461 = (response: any) => {
    if (response.status() === 461) got461 = true;
  };
  page.on("response", detect461);

  await page.goto(`https://www.xiaohongshu.com/explore/${noteId}`);
  await delay(3000);

  if (got461) {
    console.log("  WARNING: 461 detected, comments may be incomplete");
  }

  // Scroll to load comments
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await delay(1000);
  }
  await delay(2000);

  console.log(`  Initial: ${comments.size} comments, hasMore: ${lastHasMore}`);

  // Paginate via scrolling
  if (lastHasMore) {
    let scrollAttempts = 0;
    const maxScrolls = 50;
    let prevSize = comments.size;

    while (lastHasMore && scrollAttempts < maxScrolls) {
      scrollAttempts++;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(2000);

      if (comments.size > prevSize) {
        prevSize = comments.size;
        if (scrollAttempts % 5 === 0) {
          process.stdout.write(`  scroll${scrollAttempts}(${comments.size}) `);
        }
      } else {
        try {
          const loadMore = await page.$('[class*="show-more"], [class*="load-more"], text="展开更多评论"');
          if (loadMore) {
            await loadMore.click();
            await delay(2000);
          } else {
            break;
          }
        } catch {
          break;
        }
      }
    }
    if (scrollAttempts > 5) console.log();
  }

  // Fetch sub-comments for comments that have unfetched replies
  for (const [id, comment] of comments) {
    if (comment._subCount > comment.replies.length) {
      let subCursor = "";
      let subMore = true;
      let subPage = 0;

      while (subMore && subPage < 20) {
        subPage++;
        try {
          const subResp = await page.evaluate(
            async ({ noteId, rootId, cursor }: { noteId: string; rootId: string; cursor: string }) => {
              try {
                const url = `/api/sns/web/v2/comment/sub/page?note_id=${noteId}&root_comment_id=${rootId}&num=10&cursor=${cursor}&image_formats=webp`;
                const res = await fetch(url, {
                  credentials: "include",
                  headers: { "Accept": "application/json" },
                });
                if (!res.ok) return { error: res.status };
                return await res.json();
              } catch (e: any) {
                return { error: e.message };
              }
            },
            { noteId, rootId: id, cursor: subCursor }
          );

          if (subResp?.data?.comments) {
            for (const sc of subResp.data.comments) {
              if (!comment.replies.find(r => r.id === sc.id)) {
                comment.replies.push(parseComment(sc));
              }
            }
            subCursor = subResp.data.cursor || "";
            subMore = subResp.data.has_more ?? false;
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

  page.removeListener("response", handler);
  page.removeListener("response", detect461);

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

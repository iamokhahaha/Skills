/**
 * XHS Comment Collection - via main site (xiaohongshu.com)
 *
 * Strategy: Navigate to each post on xiaohongshu.com (now logged in),
 * intercept comment API responses that the page naturally makes,
 * then paginate via scrolling/API replay.
 */
import { connect, waitForPageLoad } from "@/client.js";
import * as fs from "node:fs";

const TMP = "tmp";
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

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms + Math.random() * 500));
}

async function main() {
  const client = await connect();

  // ============ Step 1: Get post list from creator center ============
  console.log("=== Step 1: Fetching recent posts ===");

  const creatorPage = await client.page("xhs-comments");
  await creatorPage.setViewportSize({ width: 1280, height: 900 });

  let postsApiData: any = null;
  creatorPage.on("response", async (response: any) => {
    if (response.url().includes("/api/galaxy/") && response.url().includes("posted")) {
      try { postsApiData = await response.json(); } catch {}
    }
  });

  await creatorPage.goto("https://creator.xiaohongshu.com/publish/publish?source=official");
  await waitForPageLoad(creatorPage);
  await delay(2000);

  if (creatorPage.url().includes("login")) {
    console.log("❌ Creator center not logged in.");
    await client.disconnect();
    return;
  }

  await creatorPage.getByText("笔记管理").first().click();
  await delay(3000);

  if (!postsApiData?.data?.notes) {
    console.log("❌ Could not get posts. Aborting.");
    await client.disconnect();
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
    console.log(`  ${i + 1}. ${p.title} (👁${p.views} 💬${p.comments_count} ❤️${p.likes})`);
  });

  // ============ Step 2: Collect comments via main site ============
  console.log("\n=== Step 2: Collecting comments ===");

  // Use a separate page for main site (logged in)
  const mainPage = await client.page("xhs-main");
  await mainPage.setViewportSize({ width: 1280, height: 900 });

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

    const comments = await collectCommentsFromPage(mainPage, post.note_id);
    const totalReplies = comments.reduce((s, c) => s + c.replies.length, 0);

    allResults.push({
      ...post,
      post_url: `https://www.xiaohongshu.com/explore/${post.note_id}`,
      total_comments_collected: comments.length,
      total_replies: totalReplies,
      comments,
    });

    console.log(`  ✅ ${comments.length} comments, ${totalReplies} replies`);

    if (i < posts.length - 1) await delay(DELAY_MS);
  }

  // ============ Step 3: Save results ============
  const result = {
    platform: "xhs",
    account: "玛莎Dojo",
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

  await client.disconnect();
}

async function collectCommentsFromPage(page: any, noteId: string): Promise<Comment[]> {
  const comments = new Map<string, Comment & { _subCount: number }>();
  let lastCursor = "";
  let lastHasMore = false;

  // Set up response interception BEFORE navigation
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
          lastCursor = data.data.cursor || "";
          lastHasMore = data.data.has_more ?? false;
        }
      } catch {}
    }

    // Sub-comment API (auto-captured from UI expansion)
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

  // Navigate to the post
  const postUrl = `https://www.xiaohongshu.com/explore/${noteId}`;
  await page.goto(postUrl);
  await waitForPageLoad(page);
  await delay(3000);

  // Scroll down slowly to trigger comment loading
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await delay(1000);
  }

  // Wait for comments to load
  await delay(2000);

  console.log(`  Initial: ${comments.size} comments captured, hasMore: ${lastHasMore}`);

  // If there are more comments, keep scrolling to load them
  if (lastHasMore) {
    let scrollAttempts = 0;
    const maxScrolls = 50;
    let prevSize = comments.size;

    while (lastHasMore && scrollAttempts < maxScrolls) {
      scrollAttempts++;

      // Scroll to bottom to trigger next page load
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await delay(2000);

      // Check if new comments were loaded
      if (comments.size > prevSize) {
        prevSize = comments.size;
        if (scrollAttempts % 5 === 0) {
          process.stdout.write(`  scroll${scrollAttempts}(${comments.size}) `);
        }
      } else {
        // No new comments after scroll, try clicking "load more" if available
        try {
          const loadMore = await page.$('[class*="show-more"], [class*="load-more"], text="展开更多评论"');
          if (loadMore) {
            await loadMore.click();
            await delay(2000);
          } else {
            // No more comments to load
            break;
          }
        } catch {
          break;
        }
      }
    }

    if (scrollAttempts > 5) console.log();
  }

  // Now fetch sub-comments for comments that have unfetched replies
  for (const [id, comment] of comments) {
    if (comment._subCount > comment.replies.length) {
      // Try clicking "展开回复" in the UI, or fetch via API
      let subCursor = "";
      let subMore = true;
      let subPage = 0;

      while (subMore && subPage < 20) {
        subPage++;
        try {
          // Use page.evaluate to call the sub-comment API directly
          // The browser context has the right cookies and x-s headers will be generated
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

/**
 * Click on posts in the XHS explore feed to load comments naturally.
 * XHS's SDK handles all signing — we just capture the responses.
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
  return new Promise(r => setTimeout(r, ms + Math.random() * 300));
}

async function main() {
  fs.mkdirSync(TMP, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  // Step 1: Get posts from creator center
  console.log("=== Getting posts from creator center ===");
  let postsApiData: any = null;
  const postHandler = async (response: any) => {
    if (response.url().includes("/api/galaxy/") && response.url().includes("posted")) {
      try { postsApiData = await response.json(); } catch {}
    }
  };
  page.on("response", postHandler);

  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official");
  await delay(3000);

  if (page.url().includes("login")) {
    console.log("Creator center not logged in. Please login in browser...");
    await delay(30000);
    await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official");
    await delay(3000);
  }

  // Click 笔记管理
  try {
    await page.getByText("笔记管理").first().click({ timeout: 5000 });
    await delay(3000);
  } catch {
    // Try navigating directly
    await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official&query=笔记管理");
    await delay(3000);
  }

  page.removeListener("response", postHandler);

  if (!postsApiData?.data?.notes) {
    console.log("Could not get posts. Aborting.");
    await context.close();
    return;
  }

  const posts = postsApiData.data.notes.slice(0, MAX_POSTS).map((n: any) => ({
    note_id: n.id || n.note_id,
    title: n.display_title || n.title || "(untitled)",
    comments_count: n.comments_count || 0,
    views: n.view_count || 0,
    likes: n.likes || 0,
  }));

  console.log(`Got ${posts.length} posts`);
  posts.forEach((p: any, i: number) =>
    console.log(`  ${i + 1}. ${p.title} (comments: ${p.comments_count})`)
  );

  // Step 2: Go to explore page and navigate to our profile
  console.log("\n=== Navigating to explore page ===");
  await page.goto("https://www.xiaohongshu.com/explore");
  await delay(5000);

  // Check login status
  const loginCheck = await page.evaluate(() => {
    const qrCode = document.querySelector('[class*="qrcode"]');
    const loginModal = document.querySelector('[class*="login-modal"]');
    return { hasQR: !!qrCode, hasLoginModal: !!loginModal, url: window.location.href };
  });

  if (loginCheck.hasQR || loginCheck.hasLoginModal) {
    console.log("Not logged in on main site. Need QR scan...");
    await page.screenshot({ path: `${TMP}/xhs-need-login.png` });
    console.log("Please scan QR code. Screenshot: xhs-need-login.png");
    // Wait for login
    for (let i = 0; i < 60; i++) {
      await delay(3000);
      const cookies = await context.cookies(["https://www.xiaohongshu.com"]);
      if (cookies.find(c => c.name === "web_session")) {
        console.log("Login detected!");
        await page.reload();
        await delay(5000);
        break;
      }
      if (i % 10 === 0) process.stdout.write(".");
    }
  }

  // Step 3: Navigate to user profile to see our posts
  console.log("\n=== Looking for our posts on the explore feed ===");

  // First, try navigating to our user profile
  // We need to find the user ID. Try extracting from cookies or page context
  const userId = await page.evaluate(async () => {
    try {
      const res = await fetch("/api/sns/web/v2/user/me", {
        credentials: "include",
      });
      // This will probably fail with 500, but try
      const data = await res.json();
      return data?.data?.user_id || null;
    } catch {
      return null;
    }
  });

  console.log(`User ID from API: ${userId || "unavailable"}`);

  // Try to find posts by navigating to user profile
  // Let's search for our content on the explore page
  console.log("\n=== Step 3: Navigating to each post URL ===");
  console.log("(XHS will use its SPA router which may trigger proper signing)");

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

    // Track comments for this post
    const comments = new Map<string, any>();
    let got461 = false;

    const responseHandler = async (response: any) => {
      const url = response.url();
      if (url.includes("/api/sns/web/v2/comment/page") && !url.includes("/sub/")) {
        try {
          const data = await response.json();
          if (data?.data?.comments) {
            for (const c of data.data.comments) {
              comments.set(c.id, c);
            }
          }
        } catch {}
      }
      if (url.includes("/api/sns/web/v2/comment/sub/page")) {
        try {
          const data = await response.json();
          if (data?.data?.comments) {
            const params = new URL(url).searchParams;
            const rootId = params.get("root_comment_id") || "";
            const parent = comments.get(rootId);
            if (parent) {
              parent.sub_comments = parent.sub_comments || [];
              for (const sc of data.data.comments) {
                if (!parent.sub_comments.find((r: any) => r.id === sc.id)) {
                  parent.sub_comments.push(sc);
                }
              }
            }
          }
        } catch {}
      }
      if (response.status() === 461) {
        got461 = true;
      }
    };

    page.on("response", responseHandler);

    // Navigate directly — even if we get 461, let's see what happens
    await page.goto(`https://www.xiaohongshu.com/explore/${post.note_id}`, {
      waitUntil: "domcontentloaded",
    });
    await delay(5000);

    if (got461) {
      console.log("  461 detected. Trying DOM scraping approach...");

      // Even with 461, check if there's any content on the page
      const pageContent = await page.evaluate(() => ({
        url: window.location.href,
        title: document.title,
        commentCount: document.querySelectorAll('[class*="comment"]').length,
      }));
      console.log(`  Page: ${pageContent.url.substring(0, 80)} | comments in DOM: ${pageContent.commentCount}`);

      // If redirected to 404, go back to explore
      if (pageContent.url.includes("/404")) {
        console.log("  Redirected to 404. Trying explore search...");

        // Try to find our post in the search
        await page.goto(`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(post.title.substring(0, 20))}&source=web_search_result_notes`);
        await delay(5000);

        // Look for our post in search results
        const searchResults = await page.$$(`a[href*="${post.note_id}"]`);
        if (searchResults.length > 0) {
          console.log("  Found in search! Clicking...");
          await searchResults[0].click();
          await delay(5000);
          console.log(`  URL: ${page.url()}`);
        }
      }
    }

    // Scroll to load more comments
    for (let s = 0; s < 5; s++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await delay(1000);
    }
    await delay(2000);

    page.removeListener("response", responseHandler);

    const parsedComments = Array.from(comments.values()).map(parseComment);
    const totalReplies = parsedComments.reduce((s, c) => s + c.replies.length, 0);

    console.log(`  Result: ${parsedComments.length} comments, ${totalReplies} replies (461: ${got461})`);

    allResults.push({
      ...post,
      post_url: `https://www.xiaohongshu.com/explore/${post.note_id}`,
      total_comments_collected: parsedComments.length,
      total_replies: totalReplies,
      comments: parsedComments,
      had_461: got461,
    });

    await delay(2000);
  }

  // Save results
  const result = {
    platform: "xhs",
    collected_at: new Date().toISOString(),
    total_posts: allResults.length,
    total_comments: allResults.reduce((s, p) => s + p.total_comments_collected, 0),
    total_replies: allResults.reduce((s, p) => s + p.total_replies, 0),
    posts: allResults,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  console.log(`\n=== Done ===`);
  console.log(`Posts: ${result.total_posts}`);
  console.log(`Comments: ${result.total_comments}`);
  console.log(`Replies: ${result.total_replies}`);
  console.log(`Output: ${OUTPUT_FILE}`);

  await context.close();
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
    replies: (raw.sub_comments || []).map(parseComment),
  };
}

main().catch(console.error);

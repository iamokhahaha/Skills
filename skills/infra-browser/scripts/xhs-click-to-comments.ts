/**
 * XHS Comment Collection — Click-based approach
 *
 * Strategy: Navigate to explore, search for our posts, click to open them
 * in the overlay/modal (not direct navigation), capture comments from XHS's
 * own SDK calls which generate proper signing.
 */
import { chromium, type Page } from "playwright";
import * as fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, "..", "profiles", "browser-data");
const TMP = join(__dirname, "..", "tmp");

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

  // ============ Step 1: Get post list from creator center ============
  console.log("=== Step 1: Getting post list from creator center ===");
  let postsApiData: any = null;
  page.on("response", async (response) => {
    if (response.url().includes("/api/galaxy/") && response.url().includes("posted")) {
      try { postsApiData = await response.json(); } catch {}
    }
  });

  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official");
  await delay(3000);
  await page.getByText("笔记管理").first().click();
  await delay(3000);

  if (!postsApiData?.data?.notes) {
    console.log("Failed to get posts.");
    await context.close();
    return;
  }

  const posts = postsApiData.data.notes.slice(0, 10).map((n: any) => ({
    note_id: n.id || n.note_id,
    title: n.display_title || n.title || "(untitled)",
    comments_count: n.comments_count || 0,
  }));

  console.log(`Got ${posts.length} posts`);

  // ============ Step 2: Go to explore and click into a post ============
  console.log("\n=== Step 2: Testing click-based post viewing ===");

  // Track comment API responses
  const commentCaptures: any[] = [];
  let currentNoteComments = new Map<string, any>();

  page.on("response", async (response) => {
    const url = response.url();

    if (url.includes("/api/sns/web/v2/comment/page") && !url.includes("/sub/")) {
      try {
        const data = await response.json();
        if (data?.data?.comments) {
          console.log(`  Comment API: ${data.data.comments.length} comments (status ${response.status()})`);
          for (const c of data.data.comments) {
            currentNoteComments.set(c.id, c);
          }
        }
      } catch {}
    }

    if (url.includes("/api/sns/web/v2/comment/sub/page") || url.includes("/api/sns/web/v1/comment/sub/page")) {
      try {
        const data = await response.json();
        if (data?.data?.comments) {
          console.log(`  Sub-comment API: ${data.data.comments.length} sub-comments`);
        }
      } catch {}
    }

    if (response.status() === 461) {
      console.log(`  461: ${url.substring(0, 80)}`);
    }
  });

  // Navigate to our profile page on the main site
  // This way we can see our own posts and click them
  console.log("Navigating to explore page...");
  await page.goto("https://www.xiaohongshu.com/explore");
  await delay(5000);

  // Check if we're logged in
  const isLoggedIn = await page.evaluate(() => {
    const loginBtn = document.querySelector('[class*="login-btn"]');
    return !loginBtn;
  });
  console.log(`Logged in on main site: ${isLoggedIn}`);

  if (!isLoggedIn) {
    console.log("Not logged in on main site. Trying to navigate to user profile...");
  }

  // Try navigating to our profile page directly
  // First let's find our user ID from the creator center data
  console.log("\nTrying to navigate to user profile...");
  await page.goto("https://www.xiaohongshu.com/user/profile/5def56000000000001008f6f");
  await delay(5000);
  console.log(`Profile URL: ${page.url()}`);

  // Check what's on the page
  const profileState = await page.evaluate(() => ({
    title: document.title,
    url: window.location.href,
    postCards: document.querySelectorAll('[class*="note-item"], section a[href*="/explore/"]').length,
    bodySnippet: document.body.innerText.substring(0, 200),
  }));
  console.log("Profile state:", JSON.stringify(profileState, null, 2));
  await page.screenshot({ path: `${TMP}/xhs-profile.png` });

  // Try to find and click a post card
  const postLinks = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="/explore/"], a[href*="/note/"]');
    return Array.from(links).map(a => ({
      href: (a as HTMLAnchorElement).href,
      text: a.textContent?.substring(0, 50) || "",
    })).slice(0, 10);
  });
  console.log(`Found ${postLinks.length} post links on profile`);
  postLinks.forEach(l => console.log(`  ${l.href.substring(0, 80)} - ${l.text}`));

  // Test: click first post link that matches one of our posts
  if (postLinks.length > 0) {
    const testNoteId = posts[0].note_id;
    console.log(`\nLooking for note ${testNoteId}...`);

    // Click on a post card (this should open overlay, not navigate)
    const postSelector = `a[href*="${testNoteId}"], [data-note-id="${testNoteId}"]`;
    const found = await page.$(postSelector);
    if (found) {
      console.log("Found post card, clicking...");
      currentNoteComments.clear();
      await found.click();
      await delay(5000);

      console.log(`Comments captured: ${currentNoteComments.size}`);
      console.log(`Current URL: ${page.url()}`);
      await page.screenshot({ path: `${TMP}/xhs-post-overlay.png` });
    } else {
      // Try clicking the first visible post card
      console.log("Exact match not found. Clicking first post card...");
      const firstCard = await page.$('section a[href*="/explore/"]');
      if (firstCard) {
        currentNoteComments.clear();
        await firstCard.click();
        await delay(5000);
        console.log(`Comments captured: ${currentNoteComments.size}`);
        console.log(`Current URL: ${page.url()}`);
        await page.screenshot({ path: `${TMP}/xhs-first-post-overlay.png` });
      }
    }
  }

  console.log("\nDone.");
  await context.close();
}

main().catch(console.error);

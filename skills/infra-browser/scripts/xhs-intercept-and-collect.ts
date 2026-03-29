/**
 * Intercept 461 responses to trick XHS into loading comments.
 * Strategy: Route note_info to return cached/mock data, let the page load normally,
 * and capture real comment API responses.
 */
import { chromium, type Page, type Route } from "playwright";
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

  const noteId = "69a1c16f000000002800ab0d";

  // Track all responses
  const capturedComments: any[] = [];
  let commentApiCalled = false;

  page.on("response", async (response) => {
    const url = response.url();

    // Capture comment API responses
    if (url.includes("/api/sns/web/v2/comment/page") && !url.includes("/sub/")) {
      commentApiCalled = true;
      try {
        const data = await response.json();
        console.log(`  Comment API: status=${response.status()}, comments=${data?.data?.comments?.length || 0}`);
        if (data?.data?.comments) {
          capturedComments.push(...data.data.comments);
        }
      } catch {}
    }

    // Log 461s
    if (response.status() === 461) {
      console.log(`  461: ${url.substring(0, 100)}`);
    }
  });

  // Strategy 1: Intercept 461 responses and retry/modify
  let interceptCount = 0;
  await page.route("**/api/sns/h5/v1/note_info*", async (route: Route) => {
    interceptCount++;
    const request = route.request();
    console.log(`  Intercepted note_info #${interceptCount}`);

    // Let the request through but check if we get 461
    try {
      const response = await route.fetch();
      const status = response.status();
      console.log(`  note_info response: ${status}`);

      if (status === 461) {
        // Return a minimal fake response to trick the page
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            code: 0,
            success: true,
            msg: "success",
            data: {
              items: [{
                id: noteId,
                note_card: {
                  type: "normal",
                  user: { nickname: "Test", user_id: "test" },
                  title: "Test",
                  desc: "Test content",
                  image_list: [],
                  interact_info: {
                    liked: false,
                    liked_count: "0",
                    collected: false,
                    collected_count: "0",
                    comment_count: "100",
                    share_count: "0",
                  },
                  time: Date.now(),
                },
              }],
            },
          }),
        });
      } else {
        await route.fulfill({ response });
      }
    } catch (err) {
      console.log(`  note_info fetch error: ${err}`);
      await route.abort();
    }
  });

  console.log(`Navigating to post ${noteId}...`);
  await page.goto(`https://www.xiaohongshu.com/explore/${noteId}`);
  await delay(5000);

  console.log(`URL: ${page.url()}`);
  console.log(`Intercepted: ${interceptCount}, Comment API called: ${commentApiCalled}`);

  // Check what's visible
  const pageState = await page.evaluate(() => ({
    title: document.title,
    hasComments: document.querySelectorAll('[class*="comment"]').length,
    bodySnippet: document.body.innerText.substring(0, 300),
  }));
  console.log("Page state:", JSON.stringify(pageState, null, 2));

  await page.screenshot({ path: `${TMP}/xhs-intercept-test.png` });

  // Scroll to trigger comment loading
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await delay(1000);
  }

  await delay(3000);
  console.log(`\nCaptured ${capturedComments.length} comments`);

  if (capturedComments.length > 0) {
    fs.writeFileSync(`${TMP}/xhs-captured-comments.json`, JSON.stringify(capturedComments, null, 2));
    console.log("Saved to xhs-captured-comments.json");
  }

  await context.close();
}

main().catch(console.error);

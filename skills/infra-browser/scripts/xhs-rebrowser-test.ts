/**
 * Test XHS with rebrowser-patches to bypass Playwright detection
 */
import rebrowserPatches from "rebrowser-patches";
import { chromium } from "playwright";
import * as fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, "..", "profiles", "browser-data");
const TMP = join(__dirname, "..", "tmp");

async function main() {
  fs.mkdirSync(TMP, { recursive: true });

  // Apply rebrowser patches to make Playwright undetectable
  rebrowserPatches.patch();

  console.log("Launching patched browser...");
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

  let got461 = false;
  let commentCount = 0;

  page.on("response", async (response) => {
    if (response.status() === 461) {
      got461 = true;
      console.log(`461: ${response.url().substring(0, 100)}`);
    }
    if (response.url().includes("/api/sns/web/v2/comment/page") && !response.url().includes("/sub/")) {
      try {
        const data = await response.json();
        if (data?.data?.comments) {
          commentCount += data.data.comments.length;
          console.log(`Comments loaded: ${data.data.comments.length} (total: ${commentCount})`);
        }
      } catch {}
    }
  });

  const noteId = "69a1c16f000000002800ab0d";
  console.log(`Navigating to post ${noteId}...`);
  await page.goto(`https://www.xiaohongshu.com/explore/${noteId}`);
  await new Promise(r => setTimeout(r, 5000));

  console.log(`URL: ${page.url()}`);
  console.log(`461: ${got461}`);
  console.log(`Comments: ${commentCount}`);

  const title = await page.evaluate(() => document.title);
  console.log(`Title: ${title}`);

  await page.screenshot({ path: `${TMP}/xhs-rebrowser-test.png` });

  if (!got461 && commentCount > 0) {
    console.log("\nSUCCESS! rebrowser-patches works!");
    // Scroll to load more
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await new Promise(r => setTimeout(r, 1500));
    }
    console.log(`Final comment count: ${commentCount}`);
  }

  await context.close();
  rebrowserPatches.unpatch();
}

main().catch(console.error);

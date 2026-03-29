/**
 * Find comment APIs in creator center by navigating to comment management
 */
import { chromium, type Page } from "playwright";
import * as fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, "..", "profiles", "browser-data");
const TMP = join(__dirname, "..", "tmp");

async function main() {
  fs.mkdirSync(TMP, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  const apiCalls: any[] = [];

  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/api/") && !url.includes("edith.xiaohongshu")) return;
    const type = response.request().resourceType();
    if (type === "image" || type === "font" || type === "stylesheet") return;

    const entry: any = {
      url: url.substring(0, 250),
      status: response.status(),
      method: response.request().method(),
    };

    try {
      const ct = response.headers()["content-type"] || "";
      if (ct.includes("json")) {
        const text = await response.text();
        entry.size = text.length;
        if (text.includes("comment") || text.includes("reply") || text.includes("sub_comment")) {
          entry.hasComment = true;
          const safeName = `comment-api-${Date.now()}`;
          fs.writeFileSync(`${TMP}/${safeName}.json`, text.substring(0, 20000));
          console.log(`  [COMMENT API] ${entry.method} ${url.substring(0, 150)}`);
        }
      }
    } catch {}

    apiCalls.push(entry);
  });

  // Go to creator center
  console.log("Going to creator center...");
  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official");
  await new Promise(r => setTimeout(r, 3000));

  // Try "评论管理" or similar
  console.log("Looking for comment management...");

  // Try clicking different navigation items
  const navItems = ["评论管理", "互动管理", "笔记评论", "评论", "消息"];
  for (const text of navItems) {
    try {
      const el = page.getByText(text, { exact: false }).first();
      if (await el.count() > 0) {
        console.log(`Found: "${text}" — clicking...`);
        await el.click();
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch {}
  }

  await page.screenshot({ path: `${TMP}/xhs-creator-comments.png` });

  // Try going to data center
  console.log("\nTrying data center...");
  await page.goto("https://creator.xiaohongshu.com/statistics/overview");
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: `${TMP}/xhs-creator-data.png` });

  // Try going directly to comment management URL
  console.log("\nTrying comment management URL...");
  await page.goto("https://creator.xiaohongshu.com/comment/manage");
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: `${TMP}/xhs-creator-comment-manage.png` });

  // Try interact page
  console.log("\nTrying interact page...");
  await page.goto("https://creator.xiaohongshu.com/interact/comment");
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: `${TMP}/xhs-creator-interact.png` });

  // Now try note detail which might have a comment API
  console.log("\nTrying note detail page with comment...");
  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official");
  await new Promise(r => setTimeout(r, 2000));
  await page.getByText("笔记管理").first().click();
  await new Promise(r => setTimeout(r, 3000));

  // Click first post to see if it shows comments
  try {
    const firstPost = page.locator('[class*="note-item"], [class*="note-card"], tr').first();
    if (await firstPost.count() > 0) {
      console.log("Clicking first post...");
      await firstPost.click();
      await new Promise(r => setTimeout(r, 3000));
      await page.screenshot({ path: `${TMP}/xhs-creator-post-detail.png` });
    }
  } catch {}

  // Save all API calls
  fs.writeFileSync(`${TMP}/xhs-creator-api-calls.json`, JSON.stringify(apiCalls, null, 2));
  console.log(`\nTotal API calls captured: ${apiCalls.length}`);

  const commentApis = apiCalls.filter(a => a.hasComment);
  console.log(`Comment-related: ${commentApis.length}`);
  commentApis.forEach(a => console.log(`  [${a.status}] ${a.method} ${a.url}`));

  // Show all unique API paths
  const paths = [...new Set(apiCalls.map(a => {
    try { return new URL(a.url).pathname; } catch { return a.url; }
  }))];
  console.log(`\nAll API paths (${paths.length}):`);
  paths.forEach(p => console.log(`  ${p}`));

  await context.close();
}

main().catch(console.error);

/**
 * Debug: Test multiple approaches to XHS comment API
 */
import { chromium } from "playwright";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, "..", "profiles", "browser-data");
const TMP = join(__dirname, "..", "tmp");

async function main() {
  fs.mkdirSync(TMP, { recursive: true });

  // Extract cookies from browser
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
  });

  const page = await context.newPage();
  await page.goto("https://www.xiaohongshu.com");
  await new Promise(r => setTimeout(r, 3000));

  const cookies = await context.cookies(["https://www.xiaohongshu.com", "https://edith.xiaohongshu.com"]);
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join("; ");

  // Also try making the API call FROM the browser context (same-origin, with XHS's own signing)
  console.log("\n=== Test 1: API call from browser context (page.evaluate) ===");
  // Navigate to XHS first to get same-origin context
  // The page is already on xiaohongshu.com (or its redirect)
  const noteId = "69a1c16f000000002800ab0d";

  const browserResult = await page.evaluate(async (noteId: string) => {
    try {
      const res = await fetch(`/api/sns/web/v2/comment/page?note_id=${noteId}&cursor=&image_formats=webp`, {
        credentials: "include",
        headers: { "Accept": "application/json" },
      });
      const text = await res.text();
      return { status: res.status, body: text.substring(0, 1000) };
    } catch (e: any) {
      return { error: e.message };
    }
  }, noteId);
  console.log("Browser-context result:", JSON.stringify(browserResult, null, 2));

  // Test 2: Try creator center domain for comment API
  console.log("\n=== Test 2: Comment API via creator center domain ===");
  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official");
  await new Promise(r => setTimeout(r, 3000));

  const creatorResult = await page.evaluate(async (noteId: string) => {
    try {
      // Try different API patterns
      const endpoints = [
        `/api/sns/web/v2/comment/page?note_id=${noteId}&cursor=&image_formats=webp`,
        `/api/galaxy/creator/note/comment?note_id=${noteId}`,
        `/api/galaxy/v2/creator/note/comment/list?note_id=${noteId}&page=0`,
      ];

      const results: any[] = [];
      for (const ep of endpoints) {
        try {
          const res = await fetch(ep, {
            credentials: "include",
            headers: { "Accept": "application/json" },
          });
          const text = await res.text();
          results.push({ endpoint: ep, status: res.status, body: text.substring(0, 500) });
        } catch (e: any) {
          results.push({ endpoint: ep, error: e.message });
        }
      }
      return results;
    } catch (e: any) {
      return { error: e.message };
    }
  }, noteId);
  console.log("Creator-context results:", JSON.stringify(creatorResult, null, 2));

  // Test 3: Try calling edith API from creator context
  console.log("\n=== Test 3: Cross-origin to edith from creator ===");
  const crossOriginResult = await page.evaluate(async (noteId: string) => {
    try {
      const res = await fetch(`https://edith.xiaohongshu.com/api/sns/web/v2/comment/page?note_id=${noteId}&cursor=&image_formats=webp`, {
        credentials: "include",
        headers: { "Accept": "application/json" },
      });
      const text = await res.text();
      return { status: res.status, body: text.substring(0, 500) };
    } catch (e: any) {
      return { error: e.message };
    }
  }, noteId);
  console.log("Cross-origin result:", JSON.stringify(crossOriginResult, null, 2));

  await context.close();
}

main().catch(console.error);

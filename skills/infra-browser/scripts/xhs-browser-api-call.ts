/**
 * Use XHS's own signing JS to make comment API calls from browser context.
 * Strategy: Load explore page -> wait for XHS scripts -> call API via fetch in page
 */
import { chromium } from "playwright";
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
    ignoreDefaultArgs: ["--enable-automation"],
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  // Navigate to explore page
  console.log("Navigating to xiaohongshu.com/explore...");
  await page.goto("https://www.xiaohongshu.com/explore");
  await new Promise(r => setTimeout(r, 5000));

  console.log(`URL: ${page.url()}`);
  console.log(`Title: ${await page.evaluate(() => document.title)}`);

  // Check what signing functions exist
  const signingInfo = await page.evaluate(() => {
    const w = window as any;
    return {
      has_webmsxyw: typeof w._webmsxyw === "function",
      has_sign: typeof w._sign === "function",
      has_xhs_sign: typeof w.__xhs_sign === "function",
      windowKeys: Object.keys(w).filter(k => k.includes("sign") || k.includes("xyw") || k.includes("encrypt") || k.includes("xhs")).slice(0, 20),
    };
  });
  console.log("Signing functions:", JSON.stringify(signingInfo, null, 2));

  // Try to call the comment API from within the page context
  const noteId = "69a1c16f000000002800ab0d";

  // Attempt 1: Simple fetch with credentials
  console.log("\n=== Attempt 1: Simple fetch with credentials ===");
  const result1 = await page.evaluate(async (noteId: string) => {
    try {
      const res = await fetch(`/api/sns/web/v2/comment/page?note_id=${noteId}&cursor=&image_formats=webp`, {
        credentials: "include",
        headers: {
          "accept": "application/json, text/plain, */*",
        },
      });
      return { status: res.status, body: (await res.text()).substring(0, 1000) };
    } catch (e: any) {
      return { error: e.message };
    }
  }, noteId);
  console.log("Result:", JSON.stringify(result1, null, 2));

  // Attempt 2: Use _webmsxyw if available
  if (signingInfo.has_webmsxyw) {
    console.log("\n=== Attempt 2: Using _webmsxyw signing ===");
    const result2 = await page.evaluate(async (noteId: string) => {
      try {
        const url = `/api/sns/web/v2/comment/page?note_id=${noteId}&cursor=&image_formats=webp`;
        const w = window as any;
        const signResult = w._webmsxyw(url, undefined);

        const headers: Record<string, string> = {
          "accept": "application/json, text/plain, */*",
        };

        if (signResult) {
          if (signResult["x-s"]) headers["x-s"] = signResult["x-s"];
          if (signResult["x-t"]) headers["x-t"] = signResult["x-t"];
          if (signResult["x-s-common"]) headers["x-s-common"] = signResult["x-s-common"];
        }

        const res = await fetch(url, { credentials: "include", headers });
        return {
          status: res.status,
          body: (await res.text()).substring(0, 1000),
          signResult: signResult ? Object.keys(signResult) : null,
        };
      } catch (e: any) {
        return { error: e.message };
      }
    }, noteId);
    console.log("Result:", JSON.stringify(result2, null, 2));
  }

  // Attempt 3: Try to use XHR instead of fetch
  console.log("\n=== Attempt 3: XMLHttpRequest ===");
  const result3 = await page.evaluate(async (noteId: string) => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", `/api/sns/web/v2/comment/page?note_id=${noteId}&cursor=&image_formats=webp`);
      xhr.withCredentials = true;
      xhr.setRequestHeader("accept", "application/json");
      xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText.substring(0, 1000) });
      xhr.onerror = () => resolve({ error: "XHR failed" });
      xhr.send();
    });
  }, noteId);
  console.log("Result:", JSON.stringify(result3, null, 2));

  await page.screenshot({ path: `${TMP}/xhs-browser-api-test.png` });
  await context.close();
}

main().catch(console.error);

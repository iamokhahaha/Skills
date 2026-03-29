/**
 * Login to XHS, then test comment API via XHR (which XHS's SDK intercepts and signs)
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

  // Check if logged in
  console.log("Navigating to xiaohongshu.com...");
  await page.goto("https://www.xiaohongshu.com/explore");
  await new Promise(r => setTimeout(r, 5000));

  const cookies = await context.cookies(["https://www.xiaohongshu.com"]);
  const webSession = cookies.find(c => c.name === "web_session");
  const a1 = cookies.find(c => c.name === "a1");

  if (!webSession || !a1) {
    console.log("Not logged in. Please scan QR code...");
    await page.screenshot({ path: `${TMP}/xhs-login-qr.png` });
    console.log("Screenshot: xhs-login-qr.png");

    // Wait for login
    const maxWait = 5 * 60 * 1000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, 3000));
      const newCookies = await context.cookies(["https://www.xiaohongshu.com"]);
      if (newCookies.find(c => c.name === "web_session")) {
        console.log("Login successful!");
        // Reload to get fresh page
        await page.goto("https://www.xiaohongshu.com/explore");
        await new Promise(r => setTimeout(r, 5000));
        break;
      }
      process.stdout.write(".");
    }
  } else {
    console.log(`Logged in! a1: ${a1.value.substring(0, 15)}...`);
  }

  // Now test comment API calls using XHR from page context
  console.log("\n=== Testing comment API via XHR ===");
  const noteId = "69a1c16f000000002800ab0d";

  // Method 1: XHR (should go through XHS's interceptor)
  const xhrResult = await page.evaluate(async (noteId: string) => {
    return new Promise<any>((resolve) => {
      const xhr = new XMLHttpRequest();
      const url = `https://edith.xiaohongshu.com/api/sns/web/v2/comment/page?note_id=${noteId}&cursor=&image_formats=webp`;
      xhr.open("GET", url);
      xhr.withCredentials = true;

      // Capture what headers get set (including by XHS's interceptor)
      const originalSetHeader = xhr.setRequestHeader.bind(xhr);
      const headers: Record<string, string> = {};
      xhr.setRequestHeader = function(name: string, value: string) {
        headers[name] = value;
        return originalSetHeader(name, value);
      };

      xhr.onload = () => {
        resolve({
          status: xhr.status,
          body: xhr.responseText.substring(0, 1000),
          headers: headers,
        });
      };
      xhr.onerror = () => resolve({ error: "XHR failed", headers });
      xhr.send();
    });
  }, noteId);

  console.log("XHR result:");
  console.log(`  Status: ${xhrResult.status}`);
  console.log(`  Headers sent: ${JSON.stringify(xhrResult.headers, null, 2)}`);
  console.log(`  Body: ${xhrResult.body?.substring(0, 500)}`);

  // Method 2: Direct URL (type it in)
  console.log("\n=== Testing: Navigate to API URL directly ===");
  const apiUrl = `https://edith.xiaohongshu.com/api/sns/web/v2/comment/page?note_id=${noteId}&cursor=&image_formats=webp`;

  // Method 3: Try using the page's existing network stack by creating a hidden img
  // or script that loads from the API

  await page.screenshot({ path: `${TMP}/xhs-xhr-test.png` });
  await context.close();
}

main().catch(console.error);

/**
 * Capture REAL XHS API request headers from the explore page to understand
 * what's needed for API calls. The explore page loads fine and makes API calls.
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

  // Capture request headers for all API calls
  const apiRequests: any[] = [];

  page.on("request", async (request) => {
    const url = request.url();
    if (!url.includes("/api/") && !url.includes("edith.xiaohongshu")) return;
    const type = request.resourceType();
    if (type === "image" || type === "font" || type === "stylesheet") return;

    const headers = request.headers();
    apiRequests.push({
      url: url.substring(0, 200),
      method: request.method(),
      headers: headers,
    });
  });

  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/api/")) return;
    const status = response.status();
    const entry = apiRequests.find(r => url.startsWith(r.url.substring(0, 50)));

    if (status === 461) {
      console.log(`461: ${url.substring(0, 100)}`);
    } else if (url.includes("homefeed") || url.includes("recommend")) {
      console.log(`OK ${status}: ${url.substring(0, 100)}`);
      try {
        const body = await response.text();
        if (body.length > 100) {
          console.log("  Response size:", body.length);
        }
      } catch {}
    }
  });

  console.log("Loading explore page...");
  await page.goto("https://www.xiaohongshu.com/explore");
  await new Promise(r => setTimeout(r, 8000));

  // Scroll to trigger more API calls
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 600));
    await new Promise(r => setTimeout(r, 2000));
  }

  // Analyze captured requests
  console.log(`\nCaptured ${apiRequests.length} API requests`);

  // Find successful API calls (homefeed etc) and show their headers
  const interesting = apiRequests.filter(r =>
    r.url.includes("homefeed") || r.url.includes("recommend") || r.url.includes("feed")
  );

  if (interesting.length > 0) {
    console.log(`\nHeaders from successful API request (${interesting[0].url.substring(0, 80)}):`);
    const h = interesting[0].headers;
    for (const [key, val] of Object.entries(h)) {
      if (key === "cookie") {
        console.log(`  ${key}: (${String(val).length} chars)`);
      } else {
        console.log(`  ${key}: ${String(val).substring(0, 200)}`);
      }
    }
  }

  // Show all unique header keys used in API requests
  const allHeaderKeys = new Set<string>();
  apiRequests.forEach(r => Object.keys(r.headers).forEach(k => allHeaderKeys.add(k)));
  console.log(`\nAll header keys used: ${[...allHeaderKeys].sort().join(", ")}`);

  // Save full data
  fs.writeFileSync(`${TMP}/xhs-api-requests.json`, JSON.stringify(apiRequests, null, 2));

  // Now try: use captured headers to make a comment API call
  if (interesting.length > 0) {
    console.log("\n=== Testing: replay real headers for comment API ===");
    const realHeaders = interesting[0].headers;

    // Generate new signing using _webmsxyw
    const noteId = "69a1c16f000000002800ab0d";
    const commentUrl = `/api/sns/web/v2/comment/page?note_id=${noteId}&cursor=&image_formats=webp`;

    const signResult = await page.evaluate((url: string) => {
      const w = window as any;
      if (typeof w._webmsxyw === "function") {
        const result = w._webmsxyw(url, undefined);
        return result;
      }
      return null;
    }, commentUrl);

    console.log("Sign result:", JSON.stringify(signResult, null, 2));

    if (signResult) {
      // Make the API call from browser with ALL real headers + new signing
      const testResult = await page.evaluate(async ({ url, sign }: any) => {
        try {
          const headers: Record<string, string> = {
            "accept": "application/json, text/plain, */*",
            "accept-language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
          };
          // Add signing headers
          for (const [k, v] of Object.entries(sign)) {
            headers[k.toLowerCase()] = String(v);
          }
          const res = await fetch(url, { credentials: "include", headers });
          return { status: res.status, body: (await res.text()).substring(0, 1000) };
        } catch (e: any) {
          return { error: e.message };
        }
      }, { url: commentUrl, sign: signResult });

      console.log("Comment API result:", JSON.stringify(testResult, null, 2));
    }
  }

  await context.close();
}

main().catch(console.error);

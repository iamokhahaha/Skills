/**
 * Find XHS's real signing function by intercepting XHR and tracing header generation
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

  // Hook into XHR to intercept the signing and make our own calls
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // Store signing info from XHS's SDK for our use
    const w = window as any;
    w.__xhsSignCaptures = [];

    const origSend = XMLHttpRequest.prototype.send;
    const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    const origOpen = XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.open = function(method: string, url: string, ...args: any[]) {
      (this as any).__xhsUrl = url;
      (this as any).__xhsHeaders = {};
      return origOpen.apply(this, [method, url, ...args] as any);
    };

    XMLHttpRequest.prototype.setRequestHeader = function(name: string, value: string) {
      const h = (this as any).__xhsHeaders;
      if (h) h[name] = value;
      return origSetHeader.apply(this, [name, value]);
    };

    XMLHttpRequest.prototype.send = function(body?: any) {
      const url = (this as any).__xhsUrl || "";
      const headers = (this as any).__xhsHeaders || {};

      // If this request has X-s header (XHS signed), capture it
      if (headers["X-s"] || headers["x-s"]) {
        w.__xhsSignCaptures.push({
          url,
          headers: { ...headers },
          timestamp: Date.now(),
        });
      }

      return origSend.apply(this, [body]);
    };

    // Also expose a function that makes a SIGNED XHR request
    // by cloning the signing from the most recent captured request
    w.__xhsSignedFetch = function(url: string): Promise<any> {
      return new Promise((resolve, reject) => {
        // Get the latest signing headers
        const latest = w.__xhsSignCaptures[w.__xhsSignCaptures.length - 1];
        if (!latest) {
          reject(new Error("No signing data captured yet"));
          return;
        }

        const xhr = new XMLHttpRequest();
        xhr.open("GET", url);
        xhr.withCredentials = true;

        // Copy ALL headers from the latest signed request
        for (const [k, v] of Object.entries(latest.headers)) {
          try {
            xhr.setRequestHeader(k, String(v));
          } catch {}
        }

        xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
        xhr.onerror = () => reject(new Error("XHR failed"));
        xhr.send();
      });
    };
  });

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  console.log("Loading explore page to capture signing...");
  await page.goto("https://www.xiaohongshu.com/explore");
  await new Promise(r => setTimeout(r, 8000));

  // Check captured signatures
  const captures = await page.evaluate(() => (window as any).__xhsSignCaptures || []);
  console.log(`Captured ${captures.length} signed requests`);

  if (captures.length > 0) {
    console.log("\nLatest signing:");
    const latest = captures[captures.length - 1];
    console.log(`  URL: ${latest.url.substring(0, 100)}`);
    for (const [k, v] of Object.entries(latest.headers)) {
      console.log(`  ${k}: ${String(v).substring(0, 80)}`);
    }

    // Now try using the captured signing to call comment API
    const noteId = "69a1c16f000000002800ab0d";
    const commentUrl = `https://edith.xiaohongshu.com/api/sns/web/v2/comment/page?note_id=${noteId}&cursor=&image_formats=webp`;

    console.log(`\n=== Testing comment API with captured signing ===`);
    console.log(`URL: ${commentUrl}`);

    const result = await page.evaluate(async (url: string) => {
      try {
        return await (window as any).__xhsSignedFetch(url);
      } catch (e: any) {
        return { error: e.message };
      }
    }, commentUrl);

    console.log(`Status: ${result.status}`);
    console.log(`Body: ${result.body?.substring(0, 500) || result.error}`);

    if (result.body) {
      fs.writeFileSync(`${TMP}/xhs-signed-comment-response.json`, result.body);
    }

    // Also try with the proper x-s generated for this specific URL
    // by triggering an actual navigation through XHS's router
    console.log(`\n=== Testing: Trigger XHS router for the note ===`);

    // Use history.pushState to trigger XHS's SPA router
    const routerResult = await page.evaluate(async (noteId: string) => {
      const w = window as any;
      try {
        // Try to use XHS's vue router directly
        if (w.__VUE_APP__?.$router) {
          w.__VUE_APP__.$router.push(`/explore/${noteId}`);
          return { method: "vue-router", success: true };
        }

        // Try React router
        const rootFiber = (document.querySelector("#app") as any)?._reactRootContainer;
        if (rootFiber) {
          return { method: "react", info: "found root" };
        }

        // Try window.dispatchEvent with popstate
        history.pushState({}, "", `/explore/${noteId}`);
        window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
        return { method: "pushState+popstate", success: true };
      } catch (e: any) {
        return { error: e.message };
      }
    }, noteId);

    console.log("Router result:", JSON.stringify(routerResult));

    await new Promise(r => setTimeout(r, 5000));

    // Check new captures after navigation
    const newCaptures = await page.evaluate(() => (window as any).__xhsSignCaptures || []);
    console.log(`Total captures after navigation: ${newCaptures.length}`);

    // Check for note_info or comment API calls
    const noteRelated = newCaptures.filter((c: any) =>
      c.url.includes("note_info") || c.url.includes("comment")
    );
    console.log(`Note-related captures: ${noteRelated.length}`);
    noteRelated.forEach((c: any) => {
      console.log(`  ${c.url.substring(0, 100)}`);
    });

    await page.screenshot({ path: `${TMP}/xhs-signing-test.png` });
  }

  await context.close();
}

main().catch(console.error);

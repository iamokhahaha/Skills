/**
 * Find and use XHS's internal HTTP client to make comment API calls.
 * The explore page's XHS SDK properly signs all requests — we need to hook into that.
 */
import { chromium, type Page } from "playwright";
import * as fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, "..", "profiles", "browser-data");
const TMP = join(__dirname, "..", "tmp");

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

  // Intercept XHR/fetch to understand how XHS signs requests
  await context.addInitScript(() => {
    // Monkey-patch XMLHttpRequest to capture headers
    const origOpen = XMLHttpRequest.prototype.open;
    const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    const capturedHeaders: Record<string, Record<string, string>> = {};
    (window as any).__xhrHeaders = capturedHeaders;

    XMLHttpRequest.prototype.open = function(method: string, url: string, ...args: any[]) {
      (this as any).__url = url;
      capturedHeaders[url] = {};
      return origOpen.apply(this, [method, url, ...args] as any);
    };

    XMLHttpRequest.prototype.setRequestHeader = function(name: string, value: string) {
      const url = (this as any).__url;
      if (url && capturedHeaders[url]) {
        capturedHeaders[url][name] = value;
      }
      return origSetHeader.apply(this, [name, value]);
    };

    // Also patch fetch
    const origFetch = window.fetch;
    (window as any).__fetchHeaders = [] as any[];
    window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const headers = init?.headers;
      (window as any).__fetchHeaders.push({
        url: url.substring(0, 200),
        headers: headers instanceof Headers ? Object.fromEntries(headers.entries()) :
                 headers || {},
      });
      return origFetch.apply(this, [input, init] as any);
    };
  });

  console.log("Loading explore page...");
  await page.goto("https://www.xiaohongshu.com/explore");
  await delay(6000);

  // Check captured headers from XHS's own API calls
  const fetchHeaders = await page.evaluate(() => (window as any).__fetchHeaders || []);
  const xhrHeaders = await page.evaluate(() => (window as any).__xhrHeaders || {});

  console.log(`\nCaptured ${fetchHeaders.length} fetch calls, ${Object.keys(xhrHeaders).length} XHR calls`);

  // Find the homefeed or any successful API call
  const apiCalls = fetchHeaders.filter((f: any) =>
    f.url.includes("/api/") || f.url.includes("edith.xiaohongshu")
  );

  console.log(`\nAPI fetch calls with headers:`);
  for (const call of apiCalls.slice(0, 5)) {
    console.log(`  ${call.url.substring(0, 80)}`);
    const h = call.headers;
    if (typeof h === 'object') {
      for (const [k, v] of Object.entries(h)) {
        if (k.toLowerCase().startsWith('x-') || k.toLowerCase() === 'authorization') {
          console.log(`    ${k}: ${String(v).substring(0, 80)}`);
        }
      }
    }
  }

  // XHR calls
  for (const [url, headers] of Object.entries(xhrHeaders)) {
    if (String(url).includes("/api/")) {
      console.log(`\n  XHR: ${String(url).substring(0, 80)}`);
      for (const [k, v] of Object.entries(headers as Record<string, string>)) {
        if (k.toLowerCase().startsWith('x-') || k.toLowerCase() === 'authorization') {
          console.log(`    ${k}: ${String(v).substring(0, 80)}`);
        }
      }
    }
  }

  // Now try: use XMLHttpRequest with XHS's interceptor (which should auto-add headers)
  console.log("\n\n=== Testing: Trigger comment load via XHS's own navigation ===");

  // Try using pushState + popstate to simulate SPA navigation to a post
  const noteId = "69a1c16f000000002800ab0d";

  // Listen for comment API calls
  let gotComments = false;
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api/sns/web/v2/comment/page")) {
      const status = response.status();
      console.log(`  Comment API: status ${status}`);
      if (status !== 461) {
        try {
          const data = await response.json();
          console.log(`  Comments: ${data?.data?.comments?.length || 0}`);
          gotComments = true;
          fs.writeFileSync(`${TMP}/xhs-comments-response.json`,
            JSON.stringify(data, null, 2).substring(0, 50000));
        } catch {}
      }
    }
    if (url.includes("note_info") && response.status() === 461) {
      console.log(`  note_info 461 detected`);
    }
  });

  // Strategy: click on a post on the explore page
  // The explore feed shows recommended posts — find one and click
  console.log("\nLooking for clickable post cards on explore...");

  const noteCards = await page.$$('section.note-item a, [class*="note-item"] a, a[href*="/explore/"]');
  console.log(`Found ${noteCards.length} note cards`);

  if (noteCards.length > 0) {
    console.log("Clicking first post card...");
    await noteCards[0].click();
    await delay(5000);

    console.log(`URL after click: ${page.url()}`);
    console.log(`Got comments: ${gotComments}`);

    await page.screenshot({ path: `${TMP}/xhs-clicked-post.png` });
  }

  // Try using SPA router
  console.log("\n=== Testing: SPA navigation via history.pushState ===");
  await page.goto("https://www.xiaohongshu.com/explore");
  await delay(3000);

  const spaResult = await page.evaluate(async (noteId: string) => {
    // Try triggering XHS's router
    const w = window as any;
    try {
      history.pushState({}, "", `/explore/${noteId}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return { method: "pushState", success: true };
    } catch (e: any) {
      return { method: "pushState", error: e.message };
    }
  }, noteId);
  console.log("SPA result:", spaResult);
  await delay(5000);
  console.log(`URL after SPA: ${page.url()}`);
  console.log(`Got comments: ${gotComments}`);

  await page.screenshot({ path: `${TMP}/xhs-spa-nav.png` });

  await context.close();
}

main().catch(console.error);

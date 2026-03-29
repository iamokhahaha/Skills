/**
 * Test XHS with stealth patches to bypass automation detection
 */
import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, "..", "profiles", "browser-data");
const TMP = join(__dirname, "..", "tmp");

async function main() {
  console.log("Launching browser with stealth...");
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: "chrome",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
    ],
    ignoreDefaultArgs: ["--enable-automation"],
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  });

  // Inject stealth scripts BEFORE any navigation
  await context.addInitScript(() => {
    // Override webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // Override plugins (Playwright has empty plugins list)
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5], // Non-empty
    });

    // Override languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['zh-CN', 'zh', 'en-US', 'en'],
    });

    // Remove Playwright's automation indicators
    // @ts-ignore
    delete window.__playwright;
    // @ts-ignore
    delete window.__pw_manual;
  });

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  // Check webdriver flag
  const webdriver = await page.evaluate(() => navigator.webdriver);
  console.log(`navigator.webdriver: ${webdriver}`);

  let got461 = false;
  page.on("response", async (response) => {
    if (response.status() === 461) {
      got461 = true;
      console.log(`461: ${response.url().substring(0, 120)}`);
    }
  });

  const noteId = "69a1c16f000000002800ab0d";
  console.log(`Navigating to post ${noteId}...`);
  await page.goto(`https://www.xiaohongshu.com/explore/${noteId}`);
  await new Promise(r => setTimeout(r, 5000));

  console.log(`URL: ${page.url()}`);
  console.log(`461 detected: ${got461}`);
  console.log(`Title: ${await page.evaluate(() => document.title)}`);

  await page.screenshot({ path: `${TMP}/xhs-stealth-test.png` });
  console.log(`Screenshot: ${TMP}/xhs-stealth-test.png`);

  await context.close();
}

main().catch(console.error);

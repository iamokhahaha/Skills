/**
 * Test XHS with a FRESH profile (no prior flags)
 */
import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRESH_PROFILE = join(__dirname, "..", "profiles", "fresh-test-" + Date.now());
const TMP = join(__dirname, "..", "tmp");

async function main() {
  mkdirSync(FRESH_PROFILE, { recursive: true });
  mkdirSync(TMP, { recursive: true });

  console.log(`Using fresh profile: ${FRESH_PROFILE}`);
  const context = await chromium.launchPersistentContext(FRESH_PROFILE, {
    headless: false,
    channel: "chrome",
    args: [
      "--disable-blink-features=AutomationControlled",
    ],
    ignoreDefaultArgs: ["--enable-automation"],
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  let got461 = false;
  page.on("response", async (response) => {
    if (response.status() === 461) {
      got461 = true;
      console.log(`461: ${response.url().substring(0, 120)}`);
    }
  });

  // Go directly to a public post (no login needed to view)
  const noteId = "69a1c16f000000002800ab0d";
  console.log(`Navigating to post ${noteId} (fresh profile, no login)...`);
  await page.goto(`https://www.xiaohongshu.com/explore/${noteId}`);
  await new Promise(r => setTimeout(r, 5000));

  console.log(`URL: ${page.url()}`);
  console.log(`461 detected: ${got461}`);

  const content = await page.evaluate(() => ({
    title: document.title,
    bodySnippet: document.body.innerText.substring(0, 300),
  }));
  console.log(`Title: ${content.title}`);
  console.log(`Body: ${content.bodySnippet.substring(0, 150)}`);

  await page.screenshot({ path: `${TMP}/xhs-fresh-test.png` });

  // Cleanup
  await context.close();
  require("fs").rmSync(FRESH_PROFILE, { recursive: true, force: true });
}

main().catch(console.error);

/**
 * Login to both creator center and main site, then keep browser open
 */
import { chromium } from "playwright";
import * as fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, "..", "profiles", "browser-data");
const TMP = join(__dirname, "..", "tmp");
const STEALTH_JS = join(__dirname, "stealth.min.js");

async function main() {
  fs.mkdirSync(TMP, { recursive: true });
  const stealthJs = fs.readFileSync(STEALTH_JS, "utf-8");

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  });

  await context.addInitScript(stealthJs);

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  // Step 1: Login to creator center
  console.log("Opening creator center...");
  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official");
  await new Promise(r => setTimeout(r, 3000));

  if (page.url().includes("login")) {
    console.log(">>> Please scan QR code to login to CREATOR CENTER <<<");
    console.log("Waiting up to 5 minutes...");

    for (let i = 0; i < 100; i++) {
      await new Promise(r => setTimeout(r, 3000));
      if (!page.url().includes("login")) {
        console.log("Creator center login successful!");
        break;
      }
      if (i % 20 === 0 && i > 0) console.log(`Still waiting... (${i * 3}s)`);
    }
  } else {
    console.log("Creator center already logged in!");
  }

  // Step 2: Login to main site
  console.log("\nOpening main site...");
  await page.goto("https://www.xiaohongshu.com/explore");
  await new Promise(r => setTimeout(r, 5000));

  const cookies = await context.cookies(["https://www.xiaohongshu.com"]);
  const hasSession = cookies.some(c => c.name === "web_session");

  if (!hasSession) {
    console.log(">>> Please login to main site if QR code appears <<<");
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const newCookies = await context.cookies(["https://www.xiaohongshu.com"]);
      if (newCookies.find(c => c.name === "web_session")) {
        console.log("Main site login successful!");
        break;
      }
    }
  } else {
    console.log("Main site already logged in!");
  }

  // Verify
  const finalCookies = await context.cookies(["https://www.xiaohongshu.com"]);
  const a1 = finalCookies.find(c => c.name === "a1")?.value;
  const ws = finalCookies.find(c => c.name === "web_session")?.value;
  console.log(`\n=== Login Status ===`);
  console.log(`a1: ${a1 ? "OK" : "MISSING"}`);
  console.log(`web_session: ${ws ? "OK" : "MISSING"}`);

  // Check mnsv2
  const hasMnsv2 = await page.evaluate(() => typeof (window as any).mnsv2 === "function");
  console.log(`mnsv2: ${hasMnsv2 ? "OK" : "MISSING"}`);

  if (a1 && ws) {
    console.log("\nAll logins complete! You can now run the comment collection script.");
  }

  await context.close();
}

main().catch(console.error);

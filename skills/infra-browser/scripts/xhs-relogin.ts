/**
 * Clear flagged XHS session and re-login with QR code
 */
import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, "..", "profiles", "browser-data");
const TMP = join(__dirname, "..", "tmp");

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  });

  // Clear ALL XHS cookies to get a fresh session
  console.log("Clearing all XHS cookies...");
  const cookies = await context.cookies();
  const xhsCookies = cookies.filter(c =>
    c.domain.includes("xiaohongshu.com")
  );
  console.log(`Clearing ${xhsCookies.length} XHS cookies`);

  // Clear by setting each to expired
  await context.clearCookies({ domain: ".xiaohongshu.com" });
  await context.clearCookies({ domain: "www.xiaohongshu.com" });
  await context.clearCookies({ domain: "edith.xiaohongshu.com" });
  await context.clearCookies({ domain: "creator.xiaohongshu.com" });

  const remaining = (await context.cookies()).filter(c => c.domain.includes("xiaohongshu"));
  console.log(`Remaining XHS cookies: ${remaining.length}`);

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  // Navigate to main site to trigger login
  console.log("\nNavigating to xiaohongshu.com...");
  await page.goto("https://www.xiaohongshu.com");
  await new Promise(r => setTimeout(r, 3000));

  await page.screenshot({ path: `${TMP}/xhs-relogin-1.png` });
  console.log("Screenshot saved: xhs-relogin-1.png");

  // Click login if available
  try {
    const loginBtn = page.locator('text=登录');
    if (await loginBtn.count() > 0) {
      await loginBtn.first().click();
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch {}

  await page.screenshot({ path: `${TMP}/xhs-relogin-qr.png` });
  console.log("Please scan QR code with XHS app");
  console.log("Screenshot: xhs-relogin-qr.png");

  // Wait for login (5 min max)
  const maxWait = 5 * 60 * 1000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 3000));

    const newCookies = await context.cookies(["https://www.xiaohongshu.com"]);
    const webSession = newCookies.find(c => c.name === "web_session");
    const a1 = newCookies.find(c => c.name === "a1");

    if (webSession && a1) {
      console.log("\nLogin successful!");
      console.log(`a1: ${a1.value.substring(0, 20)}...`);
      console.log(`web_session: ${webSession.value.substring(0, 20)}...`);
      await page.screenshot({ path: `${TMP}/xhs-relogin-success.png` });

      // Quick test: try comment API from browser context
      await page.goto("https://www.xiaohongshu.com/explore");
      await new Promise(r => setTimeout(r, 3000));

      const testResult = await page.evaluate(async () => {
        try {
          const res = await fetch("/api/sns/web/v2/comment/page?note_id=69a1c16f000000002800ab0d&cursor=&image_formats=webp", {
            credentials: "include",
          });
          return { status: res.status, body: (await res.text()).substring(0, 500) };
        } catch (e: any) {
          return { error: e.message };
        }
      });
      console.log("\nComment API test:", JSON.stringify(testResult, null, 2));

      break;
    }
    process.stdout.write(".");
  }

  // Also login to creator center
  console.log("\nNavigating to creator center...");
  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official");
  await new Promise(r => setTimeout(r, 3000));

  if (page.url().includes("login")) {
    console.log("Creator center needs separate login. Please login in the browser.");
    await new Promise(r => setTimeout(r, 30000));
  } else {
    console.log("Creator center logged in!");
  }

  await page.screenshot({ path: `${TMP}/xhs-relogin-creator.png` });

  // Keep browser open briefly for user to verify
  console.log("\nBrowser will close in 5 seconds...");
  await new Promise(r => setTimeout(r, 5000));
  await context.close();
}

main().catch(console.error);

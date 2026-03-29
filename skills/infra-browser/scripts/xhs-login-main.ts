/**
 * Login to xiaohongshu.com main site
 * Uses QR code login - user needs to scan with XHS app
 */
import { connect, waitForPageLoad } from "@/client.js";

async function main() {
  const client = await connect();
  const page = await client.page("xhs-main");
  await page.setViewportSize({ width: 1280, height: 900 });

  // Go to main site
  await page.goto("https://www.xiaohongshu.com");
  await waitForPageLoad(page);
  await page.waitForTimeout(3000);

  // Check if already logged in
  const isLoggedIn = await page.evaluate(() => {
    return !document.querySelector('[class*="login-btn"]') &&
           !document.querySelector('button:has-text("登录")');
  });

  if (isLoggedIn) {
    // Double check
    const userInfo = await page.evaluate(() => {
      const el = document.querySelector('[class*="user-name"], [class*="nickname"]');
      return el?.textContent || "unknown";
    });
    console.log(`Already logged in as: ${userInfo}`);
    await page.screenshot({ path: "tmp/xhs-main-loggedin.png" });
    await client.disconnect();
    return;
  }

  console.log("Not logged in on main site. Showing QR code...");

  // Click login button if needed
  try {
    const loginBtn = page.locator('text=登录');
    if (await loginBtn.count() > 0) {
      await loginBtn.first().click();
      await page.waitForTimeout(2000);
    }
  } catch {}

  // Take screenshot of QR code
  await page.screenshot({ path: "tmp/xhs-main-qr.png" });
  console.log("📱 Please scan QR code with XHS app");
  console.log("Screenshot: tmp/xhs-main-qr.png");

  // Poll for login completion (5 minutes max)
  const maxWait = 5 * 60 * 1000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await page.waitForTimeout(3000);
    const url = page.url();
    const stillLogin = await page.evaluate(() => {
      return !!document.querySelector('[class*="qrcode"]') ||
             !!document.querySelector('[class*="login-modal"]');
    });

    if (!stillLogin && !url.includes("login")) {
      console.log("✅ Login successful!");
      await page.screenshot({ path: "tmp/xhs-main-loggedin.png" });
      break;
    }
    process.stdout.write(".");
  }

  await client.disconnect();
}

main().catch(console.error);

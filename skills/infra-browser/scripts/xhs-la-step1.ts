/**
 * XHS Long Article — Step 1: Navigate, check login, switch to 写长文 tab
 */
import { connect, waitForPageLoad } from "@/client.js";

async function main() {
  const client = await connect();
  const page = await client.page("xhs-publish");
  await page.setViewportSize({ width: 1280, height: 900 });

  // Navigate to publish page
  console.log("Navigating to XHS publish page...");
  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await waitForPageLoad(page);

  const needsLogin = page.url().includes("/login");
  console.log({ needsLogin, url: page.url() });

  if (needsLogin) {
    console.log("请在浏览器中扫码登录小红书");
    await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-login.png" });
    await client.disconnect();
    return;
  }

  // Remove popovers
  await page.evaluate(() => {
    document.querySelectorAll('div.d-popover, [class*="popover"]').forEach(el => el.remove());
  });

  // Switch to 写长文 tab
  console.log("Switching to 写长文 tab...");
  try {
    const tab = page.getByText("写长文", { exact: true });
    await tab.waitFor({ state: "visible", timeout: 8000 });
    await tab.click();
  } catch {
    await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return node.textContent?.trim() === "写长文" ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        },
      });
      const textNode = walker.nextNode();
      if (textNode?.parentElement) textNode.parentElement.click();
    });
  }
  await page.waitForTimeout(3000);

  // Click "新的创作"
  console.log("Clicking 新的创作...");
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("button, a, div, span")) {
      if (el.textContent?.trim() === "新的创作" || el.textContent?.trim() === "开始创作") {
        (el as HTMLElement).click();
        return;
      }
    }
  });
  await page.waitForTimeout(5000);

  console.log("Current URL:", page.url());
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-la-step1.png" });
  console.log("Step 1 done. Ready for content fill.");

  await client.disconnect();
}

main().catch(console.error);

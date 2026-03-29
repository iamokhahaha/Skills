/**
 * Quick test: Can we visit XHS without 461?
 */
import { connect, waitForPageLoad } from "@/client.js";

async function main() {
  const client = await connect();
  const page = await client.page("xhs-test");
  await page.setViewportSize({ width: 1280, height: 900 });

  // Listen for 461 responses
  let got461 = false;
  page.on("response", async (response: any) => {
    if (response.status() === 461) {
      got461 = true;
      console.log(`461 detected: ${response.url().substring(0, 120)}`);
    }
  });

  console.log("Navigating to xiaohongshu.com...");
  await page.goto("https://www.xiaohongshu.com");
  await waitForPageLoad(page);
  await page.waitForTimeout(3000);

  console.log(`URL: ${page.url()}`);
  console.log(`461 detected: ${got461}`);

  // Try a specific post
  const noteId = "69a1c16f000000002800ab0d";
  console.log(`\nNavigating to post ${noteId}...`);
  await page.goto(`https://www.xiaohongshu.com/explore/${noteId}`);
  await waitForPageLoad(page);
  await page.waitForTimeout(5000);

  console.log(`URL: ${page.url()}`);
  console.log(`461 detected: ${got461}`);

  // Check page content
  const title = await page.evaluate(() => document.title);
  console.log(`Title: ${title}`);

  await page.screenshot({ path: "tmp/xhs-test-461.png" });
  console.log("Screenshot saved: tmp/xhs-test-461.png");

  await client.disconnect();
}

main().catch(console.error);

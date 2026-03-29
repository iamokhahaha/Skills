/**
 * Debug: Visit a specific XHS post and capture ALL network traffic
 * to find how comments are loaded
 */
import { connect, waitForPageLoad } from "@/client.js";
import * as fs from "node:fs";

async function main() {
  const client = await connect();
  const page = await client.page("xhs-single");
  await page.setViewportSize({ width: 1280, height: 900 });

  // Use the post with most comments (571年前 - 360 comments)
  const noteId = "69a1c16f000000002800ab0d";
  const postUrl = `https://www.xiaohongshu.com/explore/${noteId}`;

  const allApiCalls: { url: string; method: string; status: number; size: number; hasComment: boolean }[] = [];

  page.on("response", async (response: any) => {
    const url = response.url();
    // Capture everything except images/fonts/css
    const type = response.request().resourceType();
    if (type === "image" || type === "font" || type === "stylesheet") return;

    const entry: any = {
      url: url.substring(0, 250),
      method: response.request().method(),
      status: response.status(),
      type,
      hasComment: url.toLowerCase().includes("comment"),
    };

    // Try to capture JSON responses
    try {
      const ct = response.headers()["content-type"] || "";
      if (ct.includes("json") || ct.includes("javascript")) {
        const text = await response.text();
        entry.size = text.length;
        // Check if response contains comment data
        if (text.includes('"comments"') || text.includes('"comment_list"') || text.includes('"sub_comments"')) {
          entry.hasComment = true;
          entry.preview = text.substring(0, 500);
          // Save full response for analysis
          const safeName = url.replace(/[^a-z0-9]/gi, "_").substring(0, 50);
          fs.writeFileSync(`tmp/xhs-resp-${safeName}.json`, text.substring(0, 10000));
        }
      }
    } catch {}

    allApiCalls.push(entry);
  });

  console.log(`Navigating to: ${postUrl}`);
  await page.goto(postUrl);
  await waitForPageLoad(page);
  await page.waitForTimeout(5000);

  await page.screenshot({ path: "tmp/xhs-single-post.png" });

  // Scroll aggressively to trigger comment loading
  console.log("Scrolling to load comments...");
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(1000);
  }

  // Try clicking on comments section if visible
  try {
    const commentBtn = await page.$('[class*="comment"], [class*="Comment"], [data-type="comment"]');
    if (commentBtn) {
      await commentBtn.click();
      console.log("Clicked comment element");
      await page.waitForTimeout(3000);
    }
  } catch {}

  await page.waitForTimeout(3000);
  await page.screenshot({ path: "tmp/xhs-single-post-scrolled.png" });

  fs.writeFileSync("tmp/xhs-all-network.json", JSON.stringify(allApiCalls, null, 2));

  // Summary
  const commentRelated = allApiCalls.filter(c => c.hasComment);
  console.log(`\nTotal API calls: ${allApiCalls.length}`);
  console.log(`Comment-related: ${commentRelated.length}`);
  commentRelated.forEach(c => {
    console.log(`  [${c.status}] ${c.method} ${c.url}`);
    if ((c as any).preview) console.log(`    Preview: ${(c as any).preview.substring(0, 200)}`);
  });

  // Show non-image API calls
  console.log("\nAll non-image API calls:");
  allApiCalls
    .filter(c => c.type === "fetch" || c.type === "xhr" || c.url.includes("/api/"))
    .forEach(c => console.log(`  [${c.status}] ${c.type} ${c.url.substring(0, 120)}`));

  await client.disconnect();
}

main().catch(console.error);

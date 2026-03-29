/**
 * Debug: intercept ALL API calls when visiting a XHS post to find comment API
 */
import { connect, waitForPageLoad } from "@/client.js";
import * as fs from "node:fs";

const TMP = "tmp";

async function main() {
  const client = await connect();
  const page = await client.page("xhs-comments");
  await page.setViewportSize({ width: 1280, height: 900 });

  // Get note_id from first post
  const postsRaw = fs.readFileSync(`${TMP}/xhs-posts-raw.json`, "utf-8");
  const posts = JSON.parse(postsRaw);
  // Use the post with most comments (you现在对AI的恐惧 - 2410 likes, 360 comments)
  const noteId = posts[1]?.note_id || posts[0]?.note_id;
  const postUrl = `https://www.xiaohongshu.com/explore/${noteId}`;

  console.log(`Navigating to: ${postUrl}`);
  console.log(`Note ID: ${noteId}`);

  // Capture ALL requests and responses
  const allRequests: string[] = [];
  const allResponses: { url: string; status: number; preview: string }[] = [];

  page.on("request", (request: any) => {
    const url = request.url();
    if (url.includes("api") || url.includes("comment") || url.includes("sns")) {
      allRequests.push(url.substring(0, 200));
    }
  });

  page.on("response", async (response: any) => {
    const url = response.url();
    if (url.includes("api") || url.includes("comment") || url.includes("sns")) {
      let preview = "";
      try {
        const ct = response.headers()["content-type"] || "";
        if (ct.includes("json")) {
          const text = await response.text();
          preview = text.substring(0, 300);
        }
      } catch {}
      allResponses.push({ url: url.substring(0, 200), status: response.status(), preview });
    }
  });

  await page.goto(postUrl);
  await waitForPageLoad(page);
  await page.waitForTimeout(3000);

  // Take screenshot
  await page.screenshot({ path: `${TMP}/xhs-post-view.png` });
  console.log("Screenshot saved");

  // Scroll to trigger comments
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(1500);
  }

  await page.waitForTimeout(3000);

  // Save all captured data
  fs.writeFileSync(`${TMP}/xhs-debug-requests.json`, JSON.stringify(allRequests, null, 2));
  fs.writeFileSync(`${TMP}/xhs-debug-responses.json`, JSON.stringify(allResponses, null, 2));

  console.log(`\nCaptured ${allRequests.length} API requests`);
  console.log(`Captured ${allResponses.length} API responses`);

  // Print comment-related
  const commentUrls = allResponses.filter(r => r.url.includes("comment"));
  console.log(`\nComment-related responses: ${commentUrls.length}`);
  commentUrls.forEach(r => console.log(`  ${r.status} ${r.url}`));

  // Print all unique API endpoints
  const uniqueEndpoints = [...new Set(allResponses.map(r => {
    try { return new URL(r.url).pathname; } catch { return r.url; }
  }))];
  console.log("\nAll API endpoints:");
  uniqueEndpoints.forEach(ep => console.log(`  ${ep}`));

  await page.screenshot({ path: `${TMP}/xhs-post-scrolled.png` });
  await client.disconnect();
}

main().catch(console.error);

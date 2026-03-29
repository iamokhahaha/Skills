/**
 * Debug: Visit post on main site (logged in) and capture ALL network
 */
import { connect, waitForPageLoad } from "@/client.js";
import * as fs from "node:fs";

async function main() {
  const client = await connect();
  const page = await client.page("xhs-main");
  await page.setViewportSize({ width: 1280, height: 900 });

  const noteId = "69a1c16f000000002800ab0d"; // 571年前 - 360 comments
  const allResponses: any[] = [];

  page.on("response", async (response: any) => {
    const url = response.url();
    const type = response.request().resourceType();
    if (type === "image" || type === "font" || type === "stylesheet") return;

    const entry: any = { url: url.substring(0, 250), status: response.status(), type };

    try {
      const ct = response.headers()["content-type"] || "";
      if (ct.includes("json")) {
        const text = await response.text();
        entry.size = text.length;
        if (text.includes("comment") || text.includes("sub_comment")) {
          entry.hasComment = true;
          fs.writeFileSync(`tmp/xhs-main-comment-resp.json`, text.substring(0, 50000));
        }
      }
    } catch {}

    allResponses.push(entry);
  });

  console.log(`Going to: https://www.xiaohongshu.com/explore/${noteId}`);
  await page.goto(`https://www.xiaohongshu.com/explore/${noteId}`);
  await waitForPageLoad(page);
  await page.waitForTimeout(5000);

  await page.screenshot({ path: "tmp/xhs-main-post.png" });
  console.log("Screenshot saved: xhs-main-post.png");

  // Check the actual page content
  const pageContent = await page.evaluate(() => {
    return {
      url: window.location.href,
      title: document.title,
      hasComments: !!document.querySelector('[class*="comment"]'),
      commentElements: document.querySelectorAll('[class*="comment"]').length,
      bodyText: document.body.innerText.substring(0, 500),
    };
  });
  console.log("Page state:", JSON.stringify(pageContent, null, 2));

  // Scroll down
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(1500);
  }

  await page.waitForTimeout(3000);
  await page.screenshot({ path: "tmp/xhs-main-post-scrolled.png" });

  // Filter API calls
  const apiCalls = allResponses.filter(r => r.type === "fetch" || r.type === "xhr" || r.url.includes("/api/"));
  console.log(`\nAPI calls (${apiCalls.length}):`);
  apiCalls.forEach(r => {
    const mark = r.hasComment ? " 💬" : "";
    console.log(`  [${r.status}] ${r.type} ${r.url.substring(0, 120)}${mark}`);
  });

  fs.writeFileSync("tmp/xhs-main-all-responses.json", JSON.stringify(allResponses, null, 2));
  await client.disconnect();
}

main().catch(console.error);

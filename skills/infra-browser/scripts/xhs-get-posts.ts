/**
 * Step 1: Get XHS post list from creator center
 * Navigate to 笔记管理, capture API, save post IDs
 */
import { connect, waitForPageLoad } from "@/client.js";
import * as fs from "node:fs";

const TMP = "tmp";

async function main() {
  const client = await connect();
  const page = await client.page("xhs-comments");
  await page.setViewportSize({ width: 1280, height: 900 });

  const capturedResponses: any[] = [];

  // Intercept ALL API responses to find the notes list endpoint
  page.on("response", async (response: any) => {
    const url = response.url();
    if (url.includes("/api/") && response.status() === 200) {
      try {
        const ct = response.headers()["content-type"] || "";
        if (ct.includes("json")) {
          const data = await response.json();
          // Save any response that looks like it contains notes/posts
          const str = JSON.stringify(data).substring(0, 200);
          if (str.includes("note") || str.includes("title") || str.includes("笔记")) {
            capturedResponses.push({
              url: url.substring(0, 150),
              dataPreview: str,
            });
          }
        }
      } catch {}
    }
  });

  // Go to creator center
  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official");
  await waitForPageLoad(page);
  await page.waitForTimeout(2000);

  // Click "笔记管理" in sidebar
  console.log("Clicking 笔记管理...");
  const noteManagement = await page.getByText("笔记管理").first();
  if (noteManagement) {
    await noteManagement.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${TMP}/xhs-note-mgmt.png` });
    console.log("Screenshot: xhs-note-mgmt.png");
  }

  // Wait for API calls
  await page.waitForTimeout(3000);

  // Scroll to load more
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(1500);
  }

  // Save captured API responses
  fs.writeFileSync(`${TMP}/xhs-api-captures.json`, JSON.stringify(capturedResponses, null, 2));
  console.log(`Captured ${capturedResponses.length} API responses with note-related data`);

  // Also try to get ARIA snapshot for the page
  const snapshot = await client.getAISnapshot("xhs-comments");
  fs.writeFileSync(`${TMP}/xhs-notes-snapshot.txt`, snapshot);
  console.log("ARIA snapshot saved");

  // Try to extract note links from the page
  const noteLinks = await page.evaluate(() => {
    const results: any[] = [];
    // Look for all links and elements that might be notes
    document.querySelectorAll("a, [class*='note'], [class*='Note']").forEach(el => {
      const href = (el as HTMLAnchorElement).href || "";
      const text = el.textContent?.trim().substring(0, 100) || "";
      if (href.includes("note") || href.includes("explore") || text.length > 5) {
        results.push({ href, text, tag: el.tagName, classes: el.className.substring(0, 100) });
      }
    });
    return results.slice(0, 50);
  });
  fs.writeFileSync(`${TMP}/xhs-note-links.json`, JSON.stringify(noteLinks, null, 2));
  console.log(`Found ${noteLinks.length} note-related elements`);

  await page.screenshot({ path: `${TMP}/xhs-notes-final.png` });
  await client.disconnect();
}

main().catch(console.error);

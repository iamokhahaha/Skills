/**
 * Debug: Dump the full creator center posts API response
 */
import { connect, waitForPageLoad } from "@/client.js";
import * as fs from "node:fs";

async function main() {
  const client = await connect();
  const page = await client.page("xhs-comments");
  await page.setViewportSize({ width: 1280, height: 900 });

  let fullResponse: any = null;

  page.on("response", async (response: any) => {
    if (response.url().includes("/api/galaxy/") && response.url().includes("posted")) {
      try {
        fullResponse = await response.json();
        fs.writeFileSync("tmp/xhs-posts-api-full.json", JSON.stringify(fullResponse, null, 2));
        console.log("API response saved!");
      } catch (e) {
        console.log("Parse error:", e);
      }
    }
  });

  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official");
  await waitForPageLoad(page);
  await page.waitForTimeout(2000);

  await page.getByText("笔记管理").first().click();
  await page.waitForTimeout(5000);

  if (!fullResponse) {
    console.log("No API response captured. Trying page reload...");
    await page.reload();
    await page.waitForTimeout(5000);
  }

  if (fullResponse) {
    const notes = fullResponse?.data?.notes || [];
    console.log(`Total notes: ${notes.length}`);
    if (notes.length > 0) {
      console.log("First note keys:", Object.keys(notes[0]).join(", "));
      // Show first 3 notes
      for (const n of notes.slice(0, 3)) {
        const simple: any = {};
        for (const [k, v] of Object.entries(n)) {
          if (typeof v === "string" || typeof v === "number") simple[k] = v;
        }
        console.log(JSON.stringify(simple, null, 2).substring(0, 500));
      }
    }
  } else {
    console.log("Failed to capture API.");
  }

  await client.disconnect();
}

main().catch(console.error);

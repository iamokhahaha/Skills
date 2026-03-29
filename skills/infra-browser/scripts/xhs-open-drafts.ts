import { connect, waitForPageLoad } from "@/client.js";

async function main() {
  const client = await connect();
  const page = await client.page("xhs-publish");

  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await waitForPageLoad(page);
  await page.waitForTimeout(3000);

  // Use Playwright text locator to click 草稿箱
  console.log("=== Clicking 草稿箱 ===");
  try {
    await page.getByText(/草稿箱/).first().click();
    console.log("Clicked via getByText");
  } catch (e) {
    console.log("getByText failed, trying CSS...");
    // Try CSS with text content match
    await page.evaluate(() => {
      // Find the 草稿箱 button more precisely
      const allEls = document.querySelectorAll('*');
      for (const el of allEls) {
        if (el.children.length > 5) continue; // Skip containers
        const text = (el as HTMLElement).textContent?.trim() || '';
        if (text.match(/^草稿箱\(\d+\)$/) || text === '草稿箱') {
          console.log('Found:', el.tagName, el.className);
          (el as HTMLElement).click();
          break;
        }
      }
    });
  }

  await page.waitForTimeout(3000);
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-drafts-after-click.png" });

  // Check if a dialog/panel appeared
  const afterClick = await page.evaluate(() => {
    // Check for any new elements that appeared
    const text = document.body.innerText;
    const hasVideoTab = text.includes('视频笔记');
    const hasImageTab = text.includes('图文笔记');
    const hasEditBtn = text.includes('编辑');
    return {
      hasVideoTab,
      hasImageTab,
      hasEditBtn,
      bodyExcerpt: text.slice(0, 1000),
    };
  });
  console.log("After click:", JSON.stringify(afterClick, null, 2));

  // If the dialog opened, proceed
  if (afterClick.hasVideoTab) {
    console.log("Drafts dialog opened!");

    // Click "视频笔记" tab
    await page.getByText(/视频笔记/).first().click();
    await page.waitForTimeout(1000);

    // Click first "编辑"
    const editSpans = await page.$$('text=编辑');
    if (editSpans.length > 0) {
      console.log(`Found ${editSpans.length} edit buttons`);
      await editSpans[0].click();
      await page.waitForTimeout(5000);
      console.log("Navigated to:", page.url());
    }
  } else {
    console.log("Drafts dialog didn't open. Trying direct URL approach...");
    // Try going to 笔记管理 which lists all notes
    await page.goto("https://creator.xiaohongshu.com/creator/note/manage", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(5000);
    console.log("Note manage URL:", page.url());
    await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-note-manage.png" });

    const manageContent = await page.evaluate(() => {
      return document.body.innerText?.slice(0, 2000);
    });
    console.log("Manage page:", manageContent?.slice(0, 800));
  }

  await client.disconnect();
}

main().catch(console.error);

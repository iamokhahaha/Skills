import { connect, waitForPageLoad } from "@/client.js";

async function publishCurrentPage(page: any, label: string): Promise<boolean> {
  // Wait for the publish form to fully load
  await page.waitForTimeout(5000);

  // Scroll to bottom to make all settings visible
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);

  // Set AI content declaration
  console.log(`  [${label}] Setting AI declaration...`);
  const aiSelectEl = await page.$('.d-select-wrapper:has(.d-select-placeholder:text("添加内容类型声明"))');
  if (aiSelectEl) {
    await aiSelectEl.click();
  } else {
    // Fallback: find by text
    await page.evaluate(() => {
      const selects = document.querySelectorAll('.d-select-wrapper');
      for (const sel of selects) {
        const text = (sel as HTMLElement).textContent?.trim() || '';
        if (text.includes('内容类型声明') || text.includes('添加内容类型')) {
          (sel as HTMLElement).click();
          break;
        }
      }
    });
  }
  await page.waitForTimeout(1000);

  // Select "笔记含AI合成内容"
  try {
    await page.getByText('笔记含AI合成内容', { exact: true }).click();
    console.log(`  [${label}] AI declaration set`);
  } catch {
    console.log(`  [${label}] AI declaration option not found`);
  }
  await page.waitForTimeout(500);

  // Set visibility to "仅自己可见"
  console.log(`  [${label}] Setting visibility...`);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);

  // Use Playwright locator to find and click the visibility dropdown
  const visDropdown = page.locator('.d-select-wrapper').filter({ hasText: '公开可见' });
  const visDropdownCount = await visDropdown.count();
  console.log(`  [${label}] Found ${visDropdownCount} visibility dropdown(s)`);

  if (visDropdownCount > 0) {
    // Scroll the dropdown into view first
    await visDropdown.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await visDropdown.first().click();
    console.log(`  [${label}] Clicked visibility dropdown`);
    await page.waitForTimeout(1500);

    // Select "仅自己可见" from the dropdown options
    try {
      await page.getByText('仅自己可见', { exact: true }).click();
      console.log(`  [${label}] Visibility set to private`);
    } catch {
      // Retry: the dropdown might need a different click target
      console.log(`  [${label}] Retrying visibility selection...`);
      await page.evaluate(() => {
        const options = document.querySelectorAll('.d-dropdown-content div, .d-dropdown-content span, .d-select-option');
        for (const opt of options) {
          if ((opt as HTMLElement).textContent?.trim() === '仅自己可见') {
            (opt as HTMLElement).click();
            return;
          }
        }
      });
      console.log(`  [${label}] Visibility set via fallback`);
    }
  } else {
    // Fallback: try permission-card-select class
    console.log(`  [${label}] Trying permission-card-select fallback...`);
    const permSelect = page.locator('.permission-card-select');
    if (await permSelect.count() > 0) {
      await permSelect.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await permSelect.first().click();
      await page.waitForTimeout(1500);
      try {
        await page.getByText('仅自己可见', { exact: true }).click();
        console.log(`  [${label}] Visibility set to private (via permission-card-select)`);
      } catch {
        console.log(`  [${label}] Visibility option not found in fallback`);
      }
    } else {
      console.log(`  [${label}] No visibility dropdown found at all`);
    }
  }
  await page.waitForTimeout(500);

  // Verify visibility was set
  const visVerify = await page.evaluate(() => {
    const selects = document.querySelectorAll('.d-select-wrapper');
    for (const sel of selects) {
      const text = (sel as HTMLElement).textContent?.trim() || '';
      if (text.includes('可见')) return text;
    }
    return null;
  });
  console.log(`  [${label}] Visibility verification: ${visVerify}`);

  // Click "发布" button
  console.log(`  [${label}] Publishing...`);
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || '';
      if (text === '发布' && !btn.disabled && !btn.classList.contains('disabled')) {
        btn.click();
        break;
      }
    }
  });

  await page.waitForTimeout(5000);
  const success = await page.evaluate(() => document.body.innerText.includes('发布成功'));
  console.log(`  [${label}] Result: ${success ? 'SUCCESS' : 'FAILED'}`);
  return success;
}

async function main() {
  const client = await connect();
  const page = await client.page("xhs-publish");

  // ========= VIDEO DRAFT =========
  console.log("=== PUBLISHING VIDEO DRAFT ===");

  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await waitForPageLoad(page);
  await page.waitForTimeout(3000);

  // Open drafts
  await page.getByText(/草稿箱/).first().click();
  await page.waitForTimeout(2000);

  // Click 视频笔记 tab
  await page.getByText(/视频笔记/).first().click();
  await page.waitForTimeout(1000);

  // Screenshot the drafts
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-video-draft-list.png" });

  // Click first "编辑"
  const editButtons = await page.$$('span:text("编辑")');
  if (editButtons.length > 0) {
    await editButtons[0].click();
    console.log("Clicked video draft edit");
  } else {
    // Fallback: use getByText
    await page.getByText('编辑', { exact: true }).first().click();
    console.log("Clicked video draft edit (fallback)");
  }

  // Wait for draft to load (video processing, etc.)
  await page.waitForTimeout(8000);
  console.log("Video draft URL:", page.url());
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-video-draft-loaded.png" });

  const videoSuccess = await publishCurrentPage(page, 'video');
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-video-final.png" });

  // ========= IMAGE-TEXT DRAFT =========
  console.log("\n=== PUBLISHING IMAGE-TEXT DRAFT ===");

  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await waitForPageLoad(page);
  await page.waitForTimeout(3000);

  // Open drafts
  await page.getByText(/草稿箱/).first().click();
  await page.waitForTimeout(2000);

  // Click 图文笔记 tab
  await page.getByText(/图文笔记/).first().click();
  await page.waitForTimeout(1000);

  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-image-draft-list.png" });

  // Click first "编辑" (should be our "2056年，最后一个真人老师" draft)
  const imageEditButtons = await page.$$('span:text("编辑")');
  if (imageEditButtons.length > 0) {
    await imageEditButtons[0].click();
    console.log("Clicked image draft edit");
  } else {
    await page.getByText('编辑', { exact: true }).first().click();
    console.log("Clicked image draft edit (fallback)");
  }

  await page.waitForTimeout(8000);
  console.log("Image draft URL:", page.url());
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-image-draft-loaded.png" });

  const imageSuccess = await publishCurrentPage(page, 'image');
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-image-final.png" });

  console.log("\n=== SUMMARY ===");
  console.log(`Video: ${videoSuccess ? 'PUBLISHED' : 'FAILED'}`);
  console.log(`Image: ${imageSuccess ? 'PUBLISHED' : 'FAILED'}`);
  console.log("Long article: Already published earlier");

  await client.disconnect();
}

main().catch(console.error);

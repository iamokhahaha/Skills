import { connect, waitForPageLoad } from "@/client.js";

async function setSettingsAndPublish(page: any, draftType: string) {
  // Wait for page to load
  await page.waitForTimeout(3000);

  // Check if we need to scroll down to find the settings
  // The publish settings are at the bottom of the form

  // Set AI content declaration
  console.log(`  [${draftType}] 设置AI声明...`);
  const aiSet = await page.evaluate(() => {
    // Look for "添加内容类型声明" dropdown or any select with declaration text
    const selects = document.querySelectorAll('.d-select-wrapper, [class*="select"]');
    for (const sel of selects) {
      const text = (sel as HTMLElement).textContent?.trim() || '';
      if (text.includes('内容类型声明') || text.includes('添加内容类型')) {
        (sel as HTMLElement).click();
        return 'found-declaration-select';
      }
    }
    // Fallback: look by text content
    const allEls = document.querySelectorAll('*');
    for (const el of allEls) {
      const text = (el as HTMLElement).textContent?.trim() || '';
      if (text === '添加内容类型声明' && el.tagName !== 'BODY') {
        const parent = el.closest('.d-select-wrapper, .d-select');
        if (parent) {
          (parent as HTMLElement).click();
          return 'found-via-text';
        }
        (el as HTMLElement).click();
        return 'clicked-text-directly';
      }
    }
    return null;
  });
  console.log(`  AI select: ${aiSet}`);
  await page.waitForTimeout(1000);

  if (aiSet) {
    const aiSelected = await page.evaluate(() => {
      // Find visible dropdown with AI option
      const dropdowns = document.querySelectorAll('.d-dropdown-content, .d-popover, [class*="dropdown"]');
      for (const dd of dropdowns) {
        const text = (dd as HTMLElement).textContent || '';
        if (text.includes('AI合成')) {
          const items = dd.querySelectorAll('div, span, li');
          for (const item of items) {
            const t = (item as HTMLElement).textContent?.trim() || '';
            if (t === '笔记含AI合成内容') {
              (item as HTMLElement).click();
              return t;
            }
          }
        }
      }
      return null;
    });
    console.log(`  AI option: ${aiSelected}`);
    await page.waitForTimeout(500);
  }

  // Set visibility to "仅自己可见"
  console.log(`  [${draftType}] 设置仅自己可见...`);

  // Scroll down first to make sure the visibility dropdown is visible
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);

  const visSet = await page.evaluate(() => {
    const selects = document.querySelectorAll('.d-select-wrapper');
    for (const sel of selects) {
      const text = (sel as HTMLElement).textContent?.trim() || '';
      if (text.includes('公开可见') || sel.classList.contains('permission-card-select')) {
        (sel as HTMLElement).click();
        return 'found';
      }
    }
    return null;
  });
  console.log(`  Visibility select: ${visSet}`);
  await page.waitForTimeout(1000);

  if (visSet) {
    const visSelected = await page.evaluate(() => {
      const dropdowns = document.querySelectorAll('.d-dropdown-content, .d-popover');
      for (const dd of dropdowns) {
        const text = (dd as HTMLElement).textContent || '';
        if (text.includes('仅自己可见')) {
          const items = dd.querySelectorAll('div, span, li');
          for (const item of items) {
            const t = (item as HTMLElement).textContent?.trim() || '';
            if (t === '仅自己可见') {
              (item as HTMLElement).click();
              return t;
            }
          }
        }
      }
      return null;
    });
    console.log(`  Visibility: ${visSelected}`);
    await page.waitForTimeout(500);
  }

  // Click "发布" button
  console.log(`  [${draftType}] 点击发布...`);
  const published = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || '';
      if (text === '发布' && !btn.disabled) {
        btn.click();
        return true;
      }
    }
    // Also try "发布笔记"
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || '';
      if (text.includes('发布') && !text.includes('暂存') && !btn.disabled) {
        btn.click();
        return text;
      }
    }
    return null;
  });
  console.log(`  Published: ${published}`);
  await page.waitForTimeout(5000);

  // Check result
  const result = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      success: text.includes('发布成功') || text.includes('已发布'),
      url: window.location.href,
    };
  });
  console.log(`  Result: ${JSON.stringify(result)}`);
  return result.success;
}

async function main() {
  const client = await connect();
  const page = await client.page("xhs-publish");

  console.log("Current URL:", page.url());

  // Navigate to publish page (it should auto-return after the long article publish)
  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await waitForPageLoad(page);
  await page.waitForTimeout(3000);

  // Find and click the drafts button
  console.log("=== Step 1: 打开草稿箱 ===");

  // Look for 草稿箱 link/button
  const draftsOpened = await page.evaluate(() => {
    // Try clicking the drafts link
    const allEls = document.querySelectorAll('a, button, span, div');
    for (const el of allEls) {
      const text = (el as HTMLElement).textContent?.trim() || '';
      if (text.includes('草稿箱') && text.length < 15) {
        (el as HTMLElement).click();
        return text;
      }
    }
    return null;
  });
  console.log("Drafts clicked:", draftsOpened);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-drafts-list.png" });

  // Explore drafts
  const draftsList = await page.evaluate(() => {
    const result: Record<string, any> = {};
    result.text = document.body.innerText?.slice(0, 3000);

    // Find draft items (usually have edit/delete buttons)
    const draftItems = document.querySelectorAll('[class*="draft"], [class*="item"]');
    result.draftItems = Array.from(draftItems).slice(0, 20).map(el => ({
      class: el.className,
      text: (el as HTMLElement).textContent?.trim()?.slice(0, 150),
    })).filter(d => d.text);

    // Find edit/编辑 buttons
    result.editButtons = Array.from(document.querySelectorAll('a, button')).filter(el => {
      const text = (el as HTMLElement).textContent?.trim() || '';
      return text.includes('编辑') && text.length < 10;
    }).map(el => ({
      tag: el.tagName,
      href: (el as HTMLAnchorElement).href || '',
      class: el.className,
    }));

    // Tabs in the draft dialog
    result.tabs = Array.from(document.querySelectorAll('[class*="tab"]')).map(t => ({
      text: (t as HTMLElement).textContent?.trim(),
      class: t.className,
      active: t.classList?.contains('active'),
    })).filter(t => t.text && t.text.length < 20);

    return result;
  });
  console.log("Drafts page text:", draftsList.text?.slice(0, 500));
  console.log("Draft items:", JSON.stringify(draftsList.draftItems?.slice(0, 5), null, 2));
  console.log("Edit buttons:", JSON.stringify(draftsList.editButtons, null, 2));
  console.log("Tabs:", JSON.stringify(draftsList.tabs, null, 2));

  // === PUBLISH VIDEO DRAFT ===
  console.log("\n=== Step 2: 发布视频草稿 ===");

  // Click "视频笔记" tab in drafts
  const videoTabClicked = await page.evaluate(() => {
    const tabs = document.querySelectorAll('[class*="tab"]');
    for (const tab of tabs) {
      const text = (tab as HTMLElement).textContent?.trim() || '';
      if (text.includes('视频笔记')) {
        (tab as HTMLElement).click();
        return text;
      }
    }
    return null;
  });
  console.log("Video tab:", videoTabClicked);
  await page.waitForTimeout(1000);

  // Click the first edit button
  const videoEdit = await page.evaluate(() => {
    const editLinks = document.querySelectorAll('span, a, button');
    for (const el of editLinks) {
      const text = (el as HTMLElement).textContent?.trim() || '';
      if (text === '编辑') {
        (el as HTMLElement).click();
        return true;
      }
    }
    return false;
  });
  console.log("Video edit clicked:", videoEdit);
  await page.waitForTimeout(5000);
  console.log("URL after edit:", page.url());

  // Now we should be on the video edit page with publish settings
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-video-edit.png" });

  // Scroll to bottom to see all settings
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);

  // Check the current state
  const videoPageState = await page.evaluate(() => {
    return {
      text: document.body.innerText?.slice(0, 2000),
      buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(t => t),
    };
  });
  console.log("Video page state:", videoPageState.text?.slice(0, 500));
  console.log("Buttons:", videoPageState.buttons);

  // Try to set settings and publish
  const videoSuccess = await setSettingsAndPublish(page, 'video');
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-video-published.png" });

  // === PUBLISH IMAGE-TEXT DRAFT ===
  console.log("\n=== Step 3: 发布图文草稿 ===");

  // Navigate back to publish page
  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await waitForPageLoad(page);
  await page.waitForTimeout(3000);

  // Open drafts again
  await page.evaluate(() => {
    const allEls = document.querySelectorAll('a, button, span, div');
    for (const el of allEls) {
      const text = (el as HTMLElement).textContent?.trim() || '';
      if (text.includes('草稿箱') && text.length < 15) {
        (el as HTMLElement).click();
        break;
      }
    }
  });
  await page.waitForTimeout(2000);

  // Click "图文笔记" tab
  const imageTabClicked = await page.evaluate(() => {
    const tabs = document.querySelectorAll('[class*="tab"]');
    for (const tab of tabs) {
      const text = (tab as HTMLElement).textContent?.trim() || '';
      if (text.includes('图文笔记')) {
        (tab as HTMLElement).click();
        return text;
      }
    }
    return null;
  });
  console.log("Image tab:", imageTabClicked);
  await page.waitForTimeout(1000);

  // Click the first edit button (should be our "2056年，最后一个真人老师" draft)
  const imageEdit = await page.evaluate(() => {
    const editLinks = document.querySelectorAll('span, a, button');
    for (const el of editLinks) {
      const text = (el as HTMLElement).textContent?.trim() || '';
      if (text === '编辑') {
        (el as HTMLElement).click();
        return true;
      }
    }
    return false;
  });
  console.log("Image edit clicked:", imageEdit);
  await page.waitForTimeout(5000);
  console.log("URL after edit:", page.url());

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);

  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-image-edit.png" });

  const imageSuccess = await setSettingsAndPublish(page, 'image');
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-image-published.png" });

  console.log("\n=== Summary ===");
  console.log(`Video published: ${videoSuccess}`);
  console.log(`Image published: ${imageSuccess}`);

  await client.disconnect();
}

main().catch(console.error);

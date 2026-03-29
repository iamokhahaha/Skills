import { connect, waitForPageLoad } from "@/client.js";

async function main() {
  const client = await connect();
  const page = await client.page("xhs-publish");

  // Navigate to publish page first
  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await waitForPageLoad(page);
  await page.waitForTimeout(3000);

  // Click 草稿箱 and wait for modal
  console.log("=== Opening drafts dialog ===");
  await page.evaluate(() => {
    const allEls = document.querySelectorAll('a, button, span, div');
    for (const el of allEls) {
      const text = (el as HTMLElement).textContent?.trim() || '';
      if (text.match(/^草稿箱/) && text.length < 15) {
        (el as HTMLElement).click();
        break;
      }
    }
  });

  // Wait for modal to appear
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-drafts-modal.png" });

  // Get the full modal content
  const modalContent = await page.evaluate(() => {
    // Look for modal/dialog/overlay
    const modals = document.querySelectorAll('[class*="modal"], [class*="dialog"], [class*="drawer"], [class*="overlay"], [class*="popup"]');
    if (modals.length > 0) {
      return Array.from(modals).map(m => ({
        class: m.className,
        text: (m as HTMLElement).textContent?.trim()?.slice(0, 500),
        visible: (m as HTMLElement).offsetParent !== null || (m as HTMLElement).style.display !== 'none',
      }));
    }
    // Fallback: search for the draft list structure
    const draftContent = document.body.innerText;
    return { noModal: true, text: draftContent?.slice(0, 2000) };
  });
  console.log("Modal content:", JSON.stringify(modalContent, null, 2));

  // Find the draft tabs in the modal
  const draftTabs = await page.evaluate(() => {
    // The draft dialog has tabs like "视频笔记(1)", "图文笔记(2)"
    const allEls = document.querySelectorAll('*');
    const tabs: string[] = [];
    for (const el of allEls) {
      const text = (el as HTMLElement).textContent?.trim() || '';
      if ((text.includes('视频笔记') || text.includes('图文笔记') || text.includes('长文笔记')) && text.length < 15) {
        tabs.push(`<${el.tagName} class="${el.className}"> ${text}`);
      }
    }
    return [...new Set(tabs)];
  });
  console.log("Draft tabs found:", draftTabs);

  // Find "编辑" links in the modal
  const editLinks = await page.evaluate(() => {
    const edits: Array<{text: string, tag: string, href?: string, parent?: string}> = [];
    const allEls = document.querySelectorAll('span, a, button, div');
    for (const el of allEls) {
      const text = (el as HTMLElement).textContent?.trim() || '';
      if (text === '编辑') {
        edits.push({
          text,
          tag: el.tagName,
          href: (el as HTMLAnchorElement).href || '',
          parent: el.parentElement?.textContent?.trim()?.slice(0, 100),
        });
      }
    }
    return edits;
  });
  console.log("Edit links:", JSON.stringify(editLinks, null, 2));

  // === PUBLISH VIDEO DRAFT ===
  console.log("\n=== Publishing video draft ===");

  // First click "视频笔记" tab if it exists
  await page.evaluate(() => {
    const allEls = document.querySelectorAll('*');
    for (const el of allEls) {
      const text = (el as HTMLElement).textContent?.trim() || '';
      if (text.match(/^视频笔记/) && text.length < 15) {
        (el as HTMLElement).click();
        break;
      }
    }
  });
  await page.waitForTimeout(1000);

  // Click the first "编辑" for the video draft
  const videoEditClicked = await page.evaluate(() => {
    const edits = document.querySelectorAll('span, a');
    for (const el of edits) {
      const text = (el as HTMLElement).textContent?.trim() || '';
      if (text === '编辑') {
        (el as HTMLElement).click();
        return true;
      }
    }
    return false;
  });
  console.log("Video edit clicked:", videoEditClicked);

  // Wait for navigation
  await page.waitForTimeout(5000);
  console.log("URL after video edit:", page.url());

  // If the URL changed, we're on the edit page
  if (page.url().includes('publish')) {
    // Wait for content to load
    await page.waitForTimeout(3000);

    // Scroll to bottom to see settings
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-video-draft-edit.png" });

    // Check what's on the page
    const pageContent = await page.evaluate(() => {
      return {
        text: document.body.innerText?.slice(0, 1500),
        buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(t => t),
        selects: Array.from(document.querySelectorAll('.d-select-wrapper')).map(s => (s as HTMLElement).textContent?.trim()?.slice(0, 50)),
      };
    });
    console.log("Page content:", pageContent.text?.slice(0, 500));
    console.log("Buttons:", pageContent.buttons);
    console.log("Selects:", pageContent.selects);

    // Set AI declaration
    console.log("Setting AI declaration...");
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
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      const items = document.querySelectorAll('.d-dropdown-content div, .d-dropdown-content span');
      for (const item of items) {
        if ((item as HTMLElement).textContent?.trim() === '笔记含AI合成内容') {
          (item as HTMLElement).click();
          break;
        }
      }
    });
    await page.waitForTimeout(500);

    // Set visibility
    console.log("Setting visibility...");
    await page.evaluate(() => {
      const selects = document.querySelectorAll('.d-select-wrapper');
      for (const sel of selects) {
        const text = (sel as HTMLElement).textContent?.trim() || '';
        if (text.includes('公开可见') || sel.classList.contains('permission-card-select')) {
          (sel as HTMLElement).click();
          break;
        }
      }
    });
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      const items = document.querySelectorAll('.d-dropdown-content div, .d-dropdown-content span');
      for (const item of items) {
        if ((item as HTMLElement).textContent?.trim() === '仅自己可见') {
          (item as HTMLElement).click();
          break;
        }
      }
    });
    await page.waitForTimeout(500);

    // Publish
    console.log("Publishing video...");
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const text = btn.textContent?.trim() || '';
        if (text === '发布' && !btn.disabled) {
          btn.click();
          break;
        }
      }
    });
    await page.waitForTimeout(5000);

    const videoResult = await page.evaluate(() => ({
      success: document.body.innerText.includes('发布成功'),
      url: window.location.href,
    }));
    console.log("Video publish result:", videoResult);
    await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-video-published.png" });
  }

  // === PUBLISH IMAGE-TEXT DRAFT ===
  console.log("\n=== Publishing image-text draft ===");

  // Navigate back
  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await waitForPageLoad(page);
  await page.waitForTimeout(3000);

  // Open drafts modal again
  await page.evaluate(() => {
    const allEls = document.querySelectorAll('*');
    for (const el of allEls) {
      const text = (el as HTMLElement).textContent?.trim() || '';
      if (text.match(/^草稿箱/) && text.length < 15) {
        (el as HTMLElement).click();
        break;
      }
    }
  });
  await page.waitForTimeout(3000);

  // Click "图文笔记" tab
  await page.evaluate(() => {
    const allEls = document.querySelectorAll('*');
    for (const el of allEls) {
      const text = (el as HTMLElement).textContent?.trim() || '';
      if (text.match(/^图文笔记/) && text.length < 15) {
        (el as HTMLElement).click();
        break;
      }
    }
  });
  await page.waitForTimeout(1000);

  // Click first "编辑"
  await page.evaluate(() => {
    const edits = document.querySelectorAll('span, a');
    for (const el of edits) {
      if ((el as HTMLElement).textContent?.trim() === '编辑') {
        (el as HTMLElement).click();
        break;
      }
    }
  });
  await page.waitForTimeout(5000);
  console.log("URL after image edit:", page.url());

  // Set AI declaration
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);

  console.log("Setting AI declaration for image-text...");
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
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const items = document.querySelectorAll('.d-dropdown-content div, .d-dropdown-content span');
    for (const item of items) {
      if ((item as HTMLElement).textContent?.trim() === '笔记含AI合成内容') {
        (item as HTMLElement).click();
        break;
      }
    }
  });
  await page.waitForTimeout(500);

  // Set visibility
  console.log("Setting visibility for image-text...");
  await page.evaluate(() => {
    const selects = document.querySelectorAll('.d-select-wrapper');
    for (const sel of selects) {
      const text = (sel as HTMLElement).textContent?.trim() || '';
      if (text.includes('公开可见') || sel.classList.contains('permission-card-select')) {
        (sel as HTMLElement).click();
        break;
      }
    }
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const items = document.querySelectorAll('.d-dropdown-content div, .d-dropdown-content span');
    for (const item of items) {
      if ((item as HTMLElement).textContent?.trim() === '仅自己可见') {
        (item as HTMLElement).click();
        break;
      }
    }
  });
  await page.waitForTimeout(500);

  // Publish
  console.log("Publishing image-text...");
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || '';
      if (text === '发布' && !btn.disabled) {
        btn.click();
        break;
      }
    }
  });
  await page.waitForTimeout(5000);

  const imageResult = await page.evaluate(() => ({
    success: document.body.innerText.includes('发布成功'),
    url: window.location.href,
  }));
  console.log("Image publish result:", imageResult);
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-image-published.png" });

  console.log("\n=== All done ===");
  await client.disconnect();
}

main().catch(console.error);

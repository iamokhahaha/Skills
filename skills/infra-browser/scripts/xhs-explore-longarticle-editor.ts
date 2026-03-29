import { connect, waitForPageLoad } from "@/client.js";

async function main() {
  const client = await connect();
  const page = await client.page("xhs-publish");

  console.log("Current URL:", page.url());

  // Navigate to publish page
  if (!page.url().includes("publish/publish")) {
    await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await waitForPageLoad(page);
  }

  // Switch to long article tab
  await page.waitForSelector('.creator-tab', { timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('.creator-tab');
    for (const tab of tabs) {
      if ((tab as HTMLElement).textContent?.trim().includes('长文')) {
        (tab as HTMLElement).click();
        break;
      }
    }
  });
  await page.waitForTimeout(2000);

  // Click "新的创作" button
  console.log("=== Clicking 新的创作 ===");
  const clicked = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || '';
      if (text.includes('新的创作')) {
        btn.click();
        return text;
      }
    }
    return null;
  });
  console.log("Clicked:", clicked);

  // Wait for editor to load (might navigate to a new page)
  await page.waitForTimeout(5000);
  console.log("URL after click:", page.url());

  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-longarticle-editor.png" });

  // Explore the editor
  console.log("\n=== Editor Structure ===");
  const editorInfo = await page.evaluate(() => {
    const result: Record<string, any> = {};

    // Title
    const titles = document.querySelectorAll('input, textarea, [contenteditable="true"]');
    result.editableElements = Array.from(titles).map(el => ({
      tag: el.tagName,
      type: (el as HTMLInputElement).type || '',
      placeholder: (el as HTMLInputElement).placeholder || el.getAttribute('data-placeholder') || '',
      class: el.className,
      contentEditable: el.getAttribute('contenteditable'),
      text: (el as HTMLElement).textContent?.slice(0, 100),
    }));

    // Toolbar items
    const toolbar = document.querySelector('[class*="toolbar"], [class*="menu-bar"], [class*="editor-tool"]');
    result.toolbar = toolbar ? {
      class: toolbar.className,
      children: Array.from(toolbar.children).map(c => ({
        tag: c.tagName,
        class: c.className,
        text: (c as HTMLElement).textContent?.slice(0, 50),
        title: c.getAttribute('title'),
      })),
    } : null;

    // All buttons on the page
    result.allButtons = Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent?.trim(),
      class: b.className,
      title: b.getAttribute('title'),
    })).filter(b => b.text);

    // Style/template related elements
    const styleEls = document.querySelectorAll('[class*="style"], [class*="template"], [class*="theme"], [class*="color"]');
    result.styleElements = Array.from(styleEls).slice(0, 30).map(el => ({
      tag: el.tagName,
      class: el.className,
      text: (el as HTMLElement).textContent?.slice(0, 80),
    }));

    // Sidebar or panel
    const panels = document.querySelectorAll('[class*="panel"], [class*="sidebar"], [class*="aside"]');
    result.panels = Array.from(panels).slice(0, 10).map(el => ({
      tag: el.tagName,
      class: el.className,
      text: (el as HTMLElement).textContent?.slice(0, 200),
    }));

    // Look specifically for 杂志/排版/样式 text
    const allText = document.body.innerText;
    const keywords = ['杂志', '先锋', '排版', '模板', '样式', '颜色', '主题', '封面', '风格'];
    result.keywordHits = keywords.filter(k => allText.includes(k));

    result.bodyTextExcerpt = allText.slice(0, 3000);

    return result;
  });

  console.log("Editable elements:", JSON.stringify(editorInfo.editableElements, null, 2));
  console.log("Toolbar:", JSON.stringify(editorInfo.toolbar, null, 2));
  console.log("All buttons:", JSON.stringify(editorInfo.allButtons, null, 2));
  console.log("Style elements:", JSON.stringify(editorInfo.styleElements?.slice(0, 15), null, 2));
  console.log("Panels:", JSON.stringify(editorInfo.panels, null, 2));
  console.log("Keyword hits:", editorInfo.keywordHits);
  console.log("\nBody text:\n", editorInfo.bodyTextExcerpt);

  // Check if there's a "样式" or "模板" button/icon to click
  console.log("\n=== Looking for style picker ===");
  const stylePicker = await page.evaluate(() => {
    const allEls = document.querySelectorAll('span, div, button, a, label');
    const matches: string[] = [];
    for (const el of allEls) {
      const text = (el as HTMLElement).textContent?.trim() || '';
      const cls = el.className || '';
      if (
        (text.includes('样式') || text.includes('模板') || text.includes('主题') ||
         text.includes('排版') || text.includes('Style') || text.includes('Template')) &&
        text.length < 20
      ) {
        matches.push(`<${el.tagName} class="${typeof cls === 'string' ? cls : ''}"> ${text}`);
      }
    }
    return [...new Set(matches)];
  });
  console.log("Style pickers:", stylePicker);

  await client.disconnect();
}

main().catch(console.error);

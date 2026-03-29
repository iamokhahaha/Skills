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

  // Wait for tabs
  await page.waitForSelector('.creator-tab', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // Switch to long article tab ("写长文")
  console.log("=== Switching to 写长文 tab ===");
  const switched = await page.evaluate(() => {
    const tabs = document.querySelectorAll('.creator-tab');
    for (const tab of tabs) {
      const text = (tab as HTMLElement).textContent?.trim() || '';
      if (text.includes('长文')) {
        (tab as HTMLElement).click();
        return text;
      }
    }
    return null;
  });
  console.log("Switched to:", switched);
  await page.waitForTimeout(3000);

  // Screenshot after tab switch
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-longarticle-tab.png" });

  // Explore the long article editor page structure
  console.log("\n=== Page Structure ===");
  const structure = await page.evaluate(() => {
    const result: Record<string, any> = {};

    // Title input
    const titleInputs = document.querySelectorAll('input, textarea');
    result.inputs = Array.from(titleInputs).map(inp => ({
      tag: inp.tagName,
      type: (inp as HTMLInputElement).type,
      placeholder: (inp as HTMLInputElement).placeholder,
      class: inp.className,
      visible: (inp as HTMLElement).offsetParent !== null,
    }));

    // Content editor
    const editors = document.querySelectorAll('[contenteditable="true"]');
    result.editors = Array.from(editors).map(e => ({
      tag: e.tagName,
      class: e.className,
      role: e.getAttribute('role'),
      text: (e as HTMLElement).textContent?.slice(0, 100),
    }));

    // Toolbar / formatting buttons
    const toolbarBtns = document.querySelectorAll('[class*="toolbar"] button, [class*="menu"] button, [class*="format"] button');
    result.toolbarButtons = Array.from(toolbarBtns).map(b => ({
      text: (b as HTMLElement).textContent?.trim(),
      class: b.className,
      title: b.getAttribute('title'),
      ariaLabel: b.getAttribute('aria-label'),
    }));

    // Style/template selectors
    const styleElements = document.querySelectorAll(
      '[class*="style"], [class*="template"], [class*="theme"], [class*="layout"]'
    );
    result.styleElements = Array.from(styleElements).slice(0, 20).map(el => ({
      tag: el.tagName,
      class: el.className,
      text: (el as HTMLElement).textContent?.slice(0, 80),
    }));

    // Dropdowns and selects
    const selects = document.querySelectorAll('select, [class*="select"], [class*="dropdown"], [role="listbox"]');
    result.selects = Array.from(selects).map(s => ({
      tag: s.tagName,
      class: s.className,
      text: (s as HTMLElement).textContent?.slice(0, 80),
    }));

    // Body text excerpt
    result.bodyText = document.body.innerText.slice(0, 2000);

    return result;
  });

  console.log("Inputs:", JSON.stringify(structure.inputs, null, 2));
  console.log("Editors:", JSON.stringify(structure.editors, null, 2));
  console.log("Toolbar buttons:", JSON.stringify(structure.toolbarButtons, null, 2));
  console.log("Style elements:", JSON.stringify(structure.styleElements, null, 2));
  console.log("Selects:", JSON.stringify(structure.selects, null, 2));
  console.log("Body text:", structure.bodyText);

  // Look for "杂志先锋" or style options
  console.log("\n=== Searching for style/template selectors ===");
  const styleSearch = await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    const matches: string[] = [];
    for (const el of all) {
      const text = (el as HTMLElement).textContent?.trim() || '';
      const cls = el.className || '';
      if (
        text.includes('杂志') || text.includes('先锋') || text.includes('模板') ||
        text.includes('排版') || text.includes('样式') || text.includes('风格') ||
        (typeof cls === 'string' && (cls.includes('template') || cls.includes('style-select') || cls.includes('theme')))
      ) {
        if (text.length < 100) {
          matches.push(`<${el.tagName} class="${cls}"> ${text}`);
        }
      }
    }
    return [...new Set(matches)].slice(0, 30);
  });
  console.log("Style search results:", JSON.stringify(styleSearch, null, 2));

  // Look for color options
  console.log("\n=== Searching for color options ===");
  const colorSearch = await page.evaluate(() => {
    const all = document.querySelectorAll('[class*="color"], [style*="background"], [class*="palette"]');
    return Array.from(all).slice(0, 20).map(el => ({
      tag: el.tagName,
      class: el.className,
      style: (el as HTMLElement).style?.cssText?.slice(0, 100),
      text: (el as HTMLElement).textContent?.slice(0, 50),
    }));
  });
  console.log("Color elements:", JSON.stringify(colorSearch, null, 2));

  // Also check for visibility settings ("仅个人可见") on the page
  console.log("\n=== Searching for visibility settings ===");
  const visSearch = await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    const matches: string[] = [];
    for (const el of all) {
      const text = (el as HTMLElement).textContent?.trim() || '';
      if (
        text.includes('个人可见') || text.includes('私密') || text.includes('公开') ||
        text.includes('可见范围') || text.includes('谁可以看') || text.includes('仅自己')
      ) {
        if (text.length < 100) {
          matches.push(`<${el.tagName} class="${el.className}"> ${text}`);
        }
      }
    }
    return [...new Set(matches)].slice(0, 20);
  });
  console.log("Visibility options:", JSON.stringify(visSearch, null, 2));

  // Check for AI declaration options
  console.log("\n=== Searching for AI declaration ===");
  const aiSearch = await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    const matches: string[] = [];
    for (const el of all) {
      const text = (el as HTMLElement).textContent?.trim() || '';
      if (text.includes('AI') && (text.includes('生成') || text.includes('声明') || text.includes('创作') || text.includes('内容'))) {
        if (text.length < 100) {
          matches.push(`<${el.tagName} class="${el.className}"> ${text}`);
        }
      }
    }
    return [...new Set(matches)].slice(0, 20);
  });
  console.log("AI declaration:", JSON.stringify(aiSearch, null, 2));

  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-longarticle-explore.png" });
  await client.disconnect();
}

main().catch(console.error);

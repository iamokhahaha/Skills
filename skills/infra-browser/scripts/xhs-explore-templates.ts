import { connect, waitForPageLoad } from "@/client.js";

async function main() {
  const client = await connect();
  const page = await client.page("xhs-publish");

  console.log("Current URL:", page.url());

  // The page should already be on the article formatting page from the previous script
  // Wait for content to load
  await page.waitForTimeout(3000);

  // Click "模板与封面" button to open the template panel
  console.log("=== Clicking 模板与封面 ===");
  const tmplBtn = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent?.trim().includes('模板与封面') || btn.textContent?.trim().includes('模板')) {
        btn.click();
        return btn.textContent?.trim();
      }
    }
    return null;
  });
  console.log("Clicked:", tmplBtn);
  await page.waitForTimeout(3000);

  // Screenshot templates
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-templates-panel.png" });

  // Extract template information
  console.log("\n=== Template Panel Content ===");
  const templates = await page.evaluate(() => {
    const result: Record<string, any> = {};

    // Find the template list container
    const templateList = document.querySelector('.template-list, [class*="template"]');
    result.templateContainer = templateList ? {
      class: templateList.className,
      childCount: templateList.children.length,
      innerHTML: templateList.innerHTML?.slice(0, 3000),
    } : null;

    // Find all template items - they usually have thumbnails and names
    const templateItems = document.querySelectorAll(
      '[class*="template-item"], [class*="tmpl"], [class*="card"], .template-list > *'
    );
    result.templateItems = Array.from(templateItems).slice(0, 30).map(el => ({
      tag: el.tagName,
      class: el.className,
      text: (el as HTMLElement).textContent?.trim()?.slice(0, 100),
      dataId: el.getAttribute('data-id') || el.getAttribute('data-template-id') || el.getAttribute('data-name'),
      imgSrc: el.querySelector('img')?.src?.slice(0, 150),
    }));

    // Look for category/section headers
    const headers = document.querySelectorAll('h3, h4, [class*="category"], [class*="section-title"], [class*="group-title"]');
    result.headers = Array.from(headers).map(h => ({
      tag: h.tagName,
      class: h.className,
      text: (h as HTMLElement).textContent?.trim(),
    }));

    // Get all text in the right panel area
    const rightPanel = document.querySelector('[class*="right"], [class*="panel"], [class*="sidebar"]');
    if (rightPanel) {
      result.rightPanelText = (rightPanel as HTMLElement).textContent?.trim()?.slice(0, 2000);
    }

    // Get ALL text for template names
    const allText = document.body.innerText;
    // Search for typical template name patterns
    const templateNames: string[] = [];
    const lines = allText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0 && trimmed.length < 15 && !['预览', '下一步', '暂存离开', '收起侧边栏', '遇到问题'].includes(trimmed)) {
        // Could be a template name
        if (!trimmed.includes('http') && !trimmed.match(/^\d+$/)) {
          templateNames.push(trimmed);
        }
      }
    }
    result.possibleTemplateNames = [...new Set(templateNames)];

    // Color circles/swatches
    const colorSwatches = document.querySelectorAll(
      '[class*="color"] circle, [class*="color-item"], [class*="swatch"], [style*="border-radius: 50%"]'
    );
    result.colorSwatches = Array.from(colorSwatches).slice(0, 20).map(el => ({
      tag: el.tagName,
      class: el.className,
      style: (el as HTMLElement).style?.cssText?.slice(0, 100),
      bgColor: (el as HTMLElement).style?.backgroundColor,
    }));

    return result;
  });

  console.log("Template container:", JSON.stringify(templates.templateContainer?.class, null, 2));
  console.log("Template container children:", templates.templateContainer?.childCount);
  console.log("Template items:", JSON.stringify(templates.templateItems, null, 2));
  console.log("Headers:", JSON.stringify(templates.headers, null, 2));
  console.log("Possible template names:", JSON.stringify(templates.possibleTemplateNames, null, 2));
  console.log("Color swatches:", JSON.stringify(templates.colorSwatches, null, 2));
  if (templates.rightPanelText) {
    console.log("Right panel text:", templates.rightPanelText);
  }

  // Scroll the template panel to see more templates
  console.log("\n=== Scrolling template panel ===");
  await page.evaluate(() => {
    const templateList = document.querySelector('.template-list, [class*="template-container"], [class*="template-panel"]');
    if (templateList) {
      templateList.scrollTop = templateList.scrollHeight;
    }
    // Also try scrolling right panel
    const rightPanel = document.querySelector('[class*="right"], [class*="sidebar"]');
    if (rightPanel) {
      rightPanel.scrollTop = rightPanel.scrollHeight;
    }
  });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-templates-scrolled.png" });

  // Get more template info after scrolling
  const moreTemplates = await page.evaluate(() => {
    const templateItems = document.querySelectorAll(
      '[class*="template-item"], [class*="tmpl"], .template-list > *'
    );
    return Array.from(templateItems).map(el => ({
      class: el.className,
      text: (el as HTMLElement).textContent?.trim()?.slice(0, 100),
      dataId: el.getAttribute('data-id'),
    }));
  });
  console.log("\nAll template items after scroll:", JSON.stringify(moreTemplates, null, 2));

  // Try getting the inner HTML of the template section for deep inspection
  console.log("\n=== Deep template HTML inspection ===");
  const templateHtml = await page.evaluate(() => {
    const container = document.querySelector('.template-list');
    if (container) return container.innerHTML?.slice(0, 5000);
    // Try any container that looks like it holds templates
    const rightArea = document.querySelector('[class*="template"], [class*="right-panel"]');
    return rightArea?.innerHTML?.slice(0, 5000);
  });
  console.log("Template HTML:", templateHtml?.slice(0, 3000));

  await client.disconnect();
}

main().catch(console.error);

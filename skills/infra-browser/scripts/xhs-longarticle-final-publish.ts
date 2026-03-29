import { connect } from "@/client.js";

async function main() {
  const client = await connect();
  const page = await client.page("xhs-publish");

  console.log("Current URL:", page.url());
  await page.waitForTimeout(2000);

  // Step 1: Set AI content declaration — click the "添加内容类型声明" dropdown
  console.log("=== Step 1: 设置AI内容声明 ===");

  // Click the "添加内容类型声明" select to open its dropdown
  const aiSelectClicked = await page.evaluate(() => {
    const selects = document.querySelectorAll('.d-select-wrapper');
    for (const sel of selects) {
      const text = (sel as HTMLElement).textContent?.trim();
      if (text?.includes('添加内容类型声明')) {
        (sel as HTMLElement).click();
        return true;
      }
    }
    return false;
  });
  console.log("AI select clicked:", aiSelectClicked);
  await page.waitForTimeout(1000);

  // Select "笔记含AI合成内容" from the dropdown
  const aiOptionSelected = await page.evaluate(() => {
    const dropdowns = document.querySelectorAll('.d-dropdown-content, .d-popover');
    for (const dd of dropdowns) {
      const text = (dd as HTMLElement).textContent || '';
      if (text.includes('AI合成')) {
        // Find the specific option
        const items = dd.querySelectorAll('[class*="item"], div, span');
        for (const item of items) {
          const itemText = (item as HTMLElement).textContent?.trim() || '';
          if (itemText === '笔记含AI合成内容') {
            (item as HTMLElement).click();
            return itemText;
          }
        }
      }
    }
    return null;
  });
  console.log("AI option selected:", aiOptionSelected);
  await page.waitForTimeout(1000);

  // Step 2: Set visibility to "仅自己可见"
  console.log("=== Step 2: 设置仅自己可见 ===");

  // Click the visibility dropdown ("公开可见")
  const visSelectClicked = await page.evaluate(() => {
    const selects = document.querySelectorAll('.d-select-wrapper');
    for (const sel of selects) {
      if (sel.classList.contains('permission-card-select')) {
        (sel as HTMLElement).click();
        return true;
      }
    }
    // Fallback: look for text "公开可见"
    for (const sel of selects) {
      const text = (sel as HTMLElement).textContent?.trim();
      if (text?.includes('公开可见') || text?.includes('可见')) {
        (sel as HTMLElement).click();
        return true;
      }
    }
    return false;
  });
  console.log("Visibility select clicked:", visSelectClicked);
  await page.waitForTimeout(1000);

  // Select "仅自己可见"
  const visOptionSelected = await page.evaluate(() => {
    const dropdowns = document.querySelectorAll('.d-dropdown-content, .d-popover');
    for (const dd of dropdowns) {
      const text = (dd as HTMLElement).textContent || '';
      if (text.includes('仅自己可见')) {
        const items = dd.querySelectorAll('[class*="item"], div, span');
        for (const item of items) {
          const itemText = (item as HTMLElement).textContent?.trim() || '';
          if (itemText === '仅自己可见') {
            (item as HTMLElement).click();
            return itemText;
          }
        }
      }
    }
    return null;
  });
  console.log("Visibility option selected:", visOptionSelected);
  await page.waitForTimeout(1000);

  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-longarticle-settings.png" });

  // Verify the settings
  const verification = await page.evaluate(() => {
    const selects = document.querySelectorAll('.d-select-wrapper');
    const settings: Record<string, string> = {};
    for (const sel of selects) {
      const desc = sel.querySelector('.d-select-description');
      const placeholder = sel.querySelector('.d-select-placeholder');
      const text = desc?.textContent?.trim() || placeholder?.textContent?.trim() || '';
      const cls = sel.className;
      if (cls.includes('permission')) {
        settings.visibility = text;
      }
      if (text.includes('AI') || text.includes('声明') || text.includes('虚构')) {
        settings.contentType = text;
      }
    }
    return settings;
  });
  console.log("Current settings:", verification);

  // Step 3: Click "发布"
  console.log("=== Step 3: 发布 ===");
  const published = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || '';
      if (text === '发布') {
        if (!btn.disabled && !btn.classList.contains('disabled')) {
          btn.click();
          return { clicked: true };
        }
        return { disabled: true };
      }
    }
    return null;
  });
  console.log("Publish result:", published);

  await page.waitForTimeout(5000);
  console.log("URL after publish:", page.url());
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-longarticle-published.png" });

  // Check for success/error
  const afterPublish = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasSuccess: text.includes('发布成功') || text.includes('已发布'),
      hasError: text.includes('失败') || text.includes('错误'),
      bodyExcerpt: text.slice(0, 500),
    };
  });
  console.log("After publish:", afterPublish);

  await client.disconnect();
}

main().catch(console.error);

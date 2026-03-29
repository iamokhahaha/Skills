import { connect } from "@/client.js";

async function main() {
  const client = await connect();
  const page = await client.page("xhs-publish");

  console.log("Current URL:", page.url());
  await page.waitForTimeout(2000);

  // Step 1: Click "杂志先锋" template
  console.log("=== Step 1: 选择杂志先锋模板 ===");
  const selected = await page.evaluate(() => {
    const cards = document.querySelectorAll('.template-card');
    for (const card of cards) {
      const title = card.querySelector('.template-title');
      if (title?.textContent?.trim() === '杂志先锋') {
        (card as HTMLElement).click();
        return true;
      }
    }
    return false;
  });
  console.log("Selected 杂志先锋:", selected);
  await page.waitForTimeout(2000);

  // Step 2: Get color options for 杂志先锋
  console.log("=== Step 2: 获取杂志先锋颜色选项 ===");
  const colors = await page.evaluate(() => {
    const cards = document.querySelectorAll('.template-card');
    for (const card of cards) {
      const title = card.querySelector('.template-title');
      if (title?.textContent?.trim() === '杂志先锋') {
        const colorItems = card.querySelectorAll('.color-item');
        return Array.from(colorItems).map((item, idx) => ({
          index: idx,
          color: (item as HTMLElement).style.getPropertyValue('--item-color'),
          bgColor: (item as HTMLElement).style.backgroundColor,
          isActive: item.classList.contains('active'),
        }));
      }
    }
    return [];
  });
  console.log("杂志先锋 colors:", JSON.stringify(colors, null, 2));

  // Step 3: Find and click the green color
  console.log("=== Step 3: 选择绿色 ===");
  const greenClicked = await page.evaluate(() => {
    const cards = document.querySelectorAll('.template-card');
    for (const card of cards) {
      const title = card.querySelector('.template-title');
      if (title?.textContent?.trim() === '杂志先锋') {
        const colorItems = card.querySelectorAll('.color-item');
        for (const item of colorItems) {
          const color = (item as HTMLElement).style.getPropertyValue('--item-color')?.toLowerCase();
          const bg = (item as HTMLElement).style.backgroundColor;
          // Green detection: look for green-ish colors
          // Parse rgb values
          const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
          if (match) {
            const [, r, g, b] = match.map(Number);
            // Green: high G, lower R and B
            if (g > r && g > b && g > 150) {
              (item as HTMLElement).click();
              return { color, bg, r, g, b };
            }
          }
          // Also check hex color
          if (color && (color.includes('ddf5de') || color.includes('83f7') || color.includes('00') && !color.includes('00000'))) {
            (item as HTMLElement).click();
            return { color, bg };
          }
        }

        // If no obvious green found, list all colors and try clicking a greenish one
        const allColors = Array.from(colorItems).map((item, i) => ({
          i,
          color: (item as HTMLElement).style.getPropertyValue('--item-color'),
          bg: (item as HTMLElement).style.backgroundColor,
        }));
        return { noGreen: true, allColors };
      }
    }
    return null;
  });
  console.log("Green selection:", JSON.stringify(greenClicked, null, 2));

  await page.waitForTimeout(2000);
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-magazine-green.png" });

  // If green wasn't auto-detected, show all colors for manual reference
  if (greenClicked && (greenClicked as any).noGreen) {
    console.log("\nNo obvious green detected. All colors for 杂志先锋:");
    const allColors = (greenClicked as any).allColors;
    for (const c of allColors) {
      console.log(`  [${c.i}] ${c.color} (${c.bg})`);
    }

    // Try clicking each color and checking which one is greenish
    // Let's try index by index - green is commonly #DDF5DE, #83F7C8, or similar
    // Try clicking index 2 (often green) or look for specific values
    const tryGreen = await page.evaluate(() => {
      const cards = document.querySelectorAll('.template-card.selected, .template-card');
      for (const card of cards) {
        const title = card.querySelector('.template-title');
        if (title?.textContent?.trim() === '杂志先锋') {
          const colorItems = card.querySelectorAll('.color-item');
          // Try each color and check for green hues
          for (let i = 0; i < colorItems.length; i++) {
            const item = colorItems[i] as HTMLElement;
            const hex = item.style.getPropertyValue('--item-color')?.toLowerCase();
            // Common green hex patterns
            if (hex.match(/#[0-9a-f]{2}[8-f][0-9a-f]{2}[0-6][0-9a-f]/)) {
              // Might be greenish (high G component)
              item.click();
              return { clicked: i, hex };
            }
          }
          // Fallback: click index 2 which is often green
          if (colorItems.length > 2) {
            (colorItems[2] as HTMLElement).click();
            return { clicked: 2, hex: (colorItems[2] as HTMLElement).style.getPropertyValue('--item-color') };
          }
        }
      }
      return null;
    });
    console.log("Tried green:", tryGreen);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-magazine-green2.png" });
  }

  // Take a full screenshot of the current state
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-longarticle-styled.png" });

  // Step 4: Now click "下一步" to proceed to publish settings
  console.log("\n=== Step 4: 点击下一步 ===");
  const nextClicked = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || '';
      if (text.includes('下一步')) {
        // Check if it's disabled
        const isDisabled = btn.classList.contains('disabled') || btn.disabled;
        if (!isDisabled) {
          btn.click();
          return { clicked: true };
        }
        return { disabled: true, classes: btn.className };
      }
    }
    return null;
  });
  console.log("Next button:", nextClicked);

  if (nextClicked && (nextClicked as any).disabled) {
    console.log("下一步 is disabled. Trying to click it anyway...");
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent?.trim().includes('下一步')) {
          btn.disabled = false;
          btn.classList.remove('disabled');
          btn.click();
          break;
        }
      }
    });
  }

  await page.waitForTimeout(3000);
  console.log("URL after next:", page.url());
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-longarticle-next.png" });

  // Explore the publish settings page
  console.log("\n=== Publish Settings Page ===");
  const publishPage = await page.evaluate(() => {
    const result: Record<string, any> = {};
    result.text = document.body.innerText?.slice(0, 3000);
    result.buttons = Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent?.trim(),
      disabled: b.disabled || b.classList.contains('disabled'),
    })).filter(b => b.text);

    // Look for visibility settings
    const selects = document.querySelectorAll('select, [class*="select"], [class*="dropdown"], [role="listbox"], [role="combobox"]');
    result.selects = Array.from(selects).map(s => ({
      tag: s.tagName,
      class: s.className,
      text: (s as HTMLElement).textContent?.trim()?.slice(0, 100),
    }));

    // Look for checkboxes/toggles
    const toggles = document.querySelectorAll('input[type="checkbox"], [class*="switch"], [class*="toggle"], [role="switch"]');
    result.toggles = Array.from(toggles).map(t => ({
      tag: t.tagName,
      class: t.className,
      checked: (t as HTMLInputElement).checked,
      text: t.parentElement?.textContent?.trim()?.slice(0, 80),
    }));

    return result;
  });
  console.log("Page text:", publishPage.text);
  console.log("Buttons:", JSON.stringify(publishPage.buttons, null, 2));
  console.log("Selects:", JSON.stringify(publishPage.selects, null, 2));
  console.log("Toggles:", JSON.stringify(publishPage.toggles, null, 2));

  await client.disconnect();
}

main().catch(console.error);

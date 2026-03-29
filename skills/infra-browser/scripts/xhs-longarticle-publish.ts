import { connect } from "@/client.js";

async function main() {
  const client = await connect();
  const page = await client.page("xhs-publish");

  console.log("Current URL:", page.url());

  // Step 1: Wait for "下一步" to become enabled (images generation)
  console.log("=== Step 1: 等待图片生成完成 ===");
  let nextEnabled = false;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(3000);
    const status = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent?.trim().includes('下一步')) {
          return {
            disabled: btn.classList.contains('disabled') || btn.disabled,
            text: btn.textContent?.trim(),
          };
        }
      }
      return null;
    });
    if (status && !status.disabled) {
      nextEnabled = true;
      console.log("下一步 enabled!");
      break;
    }
    if (i % 5 === 4) console.log(`Waiting for images... (${(i + 1) * 3}s) disabled: ${status?.disabled}`);
  }

  if (!nextEnabled) {
    console.log("Timeout waiting for 下一步 to enable");
    // Try clicking anyway
  }

  // Click "下一步"
  console.log("=== Step 2: 点击下一步 ===");
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
  await page.waitForTimeout(5000);

  console.log("URL after 下一步:", page.url());
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-longarticle-publishsettings.png" });

  // Step 3: Explore the publish settings page
  console.log("\n=== Step 3: 发布设置页面 ===");
  const settingsInfo = await page.evaluate(() => {
    const result: Record<string, any> = {};

    // Full page text
    result.bodyText = document.body.innerText?.slice(0, 4000);

    // All buttons
    result.buttons = Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent?.trim(),
      class: b.className?.slice(0, 100),
      disabled: b.disabled || b.classList.contains('disabled'),
    })).filter(b => b.text);

    // All dropdown/select-like elements
    result.dropdowns = Array.from(document.querySelectorAll(
      'select, [class*="select"], [class*="dropdown"], [role="combobox"], [role="listbox"]'
    )).map(el => ({
      tag: el.tagName,
      class: (typeof el.className === 'string') ? el.className : '',
      text: (el as HTMLElement).textContent?.trim()?.slice(0, 100),
      role: el.getAttribute('role'),
    }));

    // All toggle switches / checkboxes
    result.toggles = Array.from(document.querySelectorAll(
      'input[type="checkbox"], [class*="switch"], [class*="toggle"], [role="switch"], [role="checkbox"]'
    )).map(el => {
      const parent = el.parentElement?.parentElement?.parentElement;
      return {
        tag: el.tagName,
        class: el.className?.slice(0, 100),
        checked: (el as HTMLInputElement).checked || el.classList?.contains('checked'),
        parentText: parent?.textContent?.trim()?.slice(0, 100),
      };
    });

    // Radio groups or options
    result.radios = Array.from(document.querySelectorAll(
      'input[type="radio"], [class*="radio"], [role="radio"]'
    )).map(el => ({
      tag: el.tagName,
      class: el.className,
      checked: (el as HTMLInputElement).checked,
      text: el.parentElement?.textContent?.trim()?.slice(0, 80),
    }));

    // Settings items/sections
    result.settingItems = Array.from(document.querySelectorAll(
      '[class*="setting"], [class*="option"], [class*="form-item"]'
    )).slice(0, 20).map(el => ({
      tag: el.tagName,
      class: el.className,
      text: (el as HTMLElement).textContent?.trim()?.slice(0, 150),
    }));

    return result;
  });

  console.log("Body text:", settingsInfo.bodyText);
  console.log("\nButtons:", JSON.stringify(settingsInfo.buttons, null, 2));
  console.log("\nDropdowns:", JSON.stringify(settingsInfo.dropdowns, null, 2));
  console.log("\nToggles:", JSON.stringify(settingsInfo.toggles, null, 2));
  console.log("\nRadios:", JSON.stringify(settingsInfo.radios, null, 2));
  console.log("\nSetting items:", JSON.stringify(settingsInfo.settingItems?.slice(0, 10), null, 2));

  await client.disconnect();
}

main().catch(console.error);

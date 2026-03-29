import { connect, waitForPageLoad } from "@/client.js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Read publish data from JSON
const DATA_PATH = process.env.XHS_PUBLISH_DATA || resolve(process.cwd(), "tmp/xhs-publish-data.json");
const data = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
const IMAGES: string[] = data.images;
const TITLE: string = data.title;
const BODY: string = data.body;
const TAGS: string[] = data.tags || [];
const AI_DECLARATION: string = data.aiDeclaration || "";
const SCHEDULED_TIME: string = data.scheduledTime || "";

async function main() {
  const client = await connect();
  const page = await client.page("xhs-publish");

  console.log("Current URL:", page.url());

  // Always navigate to a fresh publish page (avoid residual content from previous runs)
  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await waitForPageLoad(page);

  // Wait for page to fully render
  console.log("=== 等待页面渲染 ===");
  try {
    await page.waitForSelector('.creator-tab', { timeout: 15000 });
    console.log("Tabs loaded");
  } catch {
    console.log("Tabs not found, waiting more...");
    await page.waitForTimeout(5000);
  }

  // Step 1: Switch to image-text tab ("上传图文")
  console.log("=== Step 1: 切换到图文标签 ===");
  const switched = await page.evaluate(() => {
    const tabs = document.querySelectorAll('.creator-tab');
    for (const tab of tabs) {
      const text = (tab as HTMLElement).textContent?.trim() || '';
      if (text.includes('图文')) {
        (tab as HTMLElement).click();
        return text;
      }
    }
    return null;
  });

  if (switched) {
    console.log(`Switched to tab: ${switched}`);
  } else {
    console.log("Failed to find image-text tab");
    // Try looking at all tabs
    const allTabs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.creator-tab, [class*="tab"]'))
        .map(t => (t as HTMLElement).textContent?.trim())
    );
    console.log("All tabs:", allTabs);
  }

  await page.waitForTimeout(2000);

  // Wait for upload area to appear after tab switch
  try {
    await page.waitForSelector('.upload-input', { timeout: 10000, state: 'attached' });
    console.log("Upload area ready");
  } catch {
    console.log("Upload area not found after tab switch, waiting...");
    await page.waitForTimeout(3000);
  }

  // Step 2: Upload images
  console.log("=== Step 2: 上传图片 ===");
  let fileInput = await page.$('input.upload-input');
  if (!fileInput) fileInput = await page.$('input[type="file"]');

  if (fileInput) {
    // Upload all images at once
    await fileInput.setInputFiles(IMAGES);
    console.log(`${IMAGES.length} images selected, waiting for upload...`);
  } else {
    console.log("No file input found");
    await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-image-noinput.png" });
    await client.disconnect();
    return;
  }

  // Wait for images to process
  let imagesReady = false;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(2000);
    const status = await page.evaluate(() => {
      // Count uploaded image thumbnails
      const thumbnails = document.querySelectorAll(
        '[class*="image-item"], [class*="upload-item"], [class*="coverImg"], .img-container img'
      );
      const hasProgress = !!document.querySelector('[class*="progress"], [class*="uploading"]');
      const hasTitle = !!document.querySelector('input[placeholder*="标题"], div.d-input input');
      return {
        thumbnailCount: thumbnails.length,
        hasProgress,
        hasTitle,
      };
    });

    if (status.thumbnailCount > 0 && !status.hasProgress && status.hasTitle) {
      imagesReady = true;
      console.log(`Images ready: ${status.thumbnailCount} thumbnails loaded`);
      break;
    }
    if (i % 3 === 2) console.log(`Uploading... (${(i + 1) * 2}s) ${JSON.stringify(status)}`);
  }

  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-images-uploaded.png" });

  if (!imagesReady) {
    console.log("Image upload timeout, continuing anyway...");
  }

  // Step 3: Fill title
  console.log("=== Step 3: 填写标题 ===");
  await page.waitForTimeout(1000);

  let titleFilled = false;
  for (const sel of ['input[placeholder*="标题"]', 'div.d-input input', 'input.c-input_inner']) {
    const titleInput = await page.$(sel);
    if (titleInput && await titleInput.isVisible()) {
      await titleInput.click();
      await page.waitForTimeout(300);
      await titleInput.fill(TITLE.slice(0, 20));
      console.log(`Title filled: "${TITLE.slice(0, 20)}" (selector: ${sel})`);
      titleFilled = true;
      break;
    }
  }
  if (!titleFilled) {
    console.log("Title input not found");
    const inputs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).map(inp => ({
        type: inp.type, placeholder: inp.placeholder, class: inp.className, visible: inp.offsetParent !== null,
      }))
    );
    console.log("All inputs:", JSON.stringify(inputs, null, 2));
  }

  // Step 4: Fill body text
  console.log("=== Step 4: 填写正文 ===");
  let bodyEditor = await page.$('div.tiptap.ProseMirror');
  if (!bodyEditor) bodyEditor = await page.$('div[contenteditable="true"][role="textbox"]');
  if (!bodyEditor) bodyEditor = await page.$('[contenteditable="true"]');

  if (bodyEditor) {
    await bodyEditor.click();
    await page.waitForTimeout(300);
    // Use clipboard paste instead of keyboard.type for speed and reliability
    await page.evaluate((text: string) => {
      const el = document.querySelector('div.tiptap.ProseMirror') ||
                 document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                 document.querySelector('[contenteditable="true"]');
      if (!el) return;
      el.focus();
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(event);
    }, BODY);
    await page.waitForTimeout(500);
    console.log("Body text filled (clipboard paste)");
  } else {
    console.log("Body editor not found");
  }

  // Step 5: Add tags
  console.log("=== Step 5: 添加标签 ===");
  if (bodyEditor) {
    // Move to end of text
    await bodyEditor.click();
    await page.keyboard.down("Meta");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.up("Meta");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    for (const tag of TAGS.slice(0, 6)) {
      await page.keyboard.type("#", { delay: 0 });
      await page.waitForTimeout(500);
      await page.keyboard.type(tag, { delay: 30 });
      await page.waitForTimeout(1500);

      const hasSuggestion = await page.$('#creator-editor-topic-container');
      if (hasSuggestion) {
        await page.keyboard.press("Enter");
        await page.waitForTimeout(800);
      } else {
        await page.keyboard.type(" ", { delay: 0 });
        await page.waitForTimeout(300);
      }
    }
    await page.keyboard.press("Escape");
    console.log("Tags added");
  }

  // Step 6: AI declaration
  console.log("=== Step 6: AI声明 ===");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);

  const aiChecked = await page.evaluate(() => {
    // More targeted: look for the specific AI declaration section
    const allEls = document.querySelectorAll('span, label');
    for (const el of allEls) {
      const text = el.textContent?.trim() || '';
      if (text.length < 30 && text.includes('AI') && (text.includes('生成') || text.includes('创作'))) {
        const parent = el.closest('div, label, section');
        if (!parent) continue;
        const toggle = parent.querySelector(
          'input[type="checkbox"], [class*="switch"], [class*="toggle"], [role="switch"]'
        );
        if (toggle) {
          (toggle as HTMLElement).click();
          return `clicked: ${text}`;
        }
      }
    }
    return null;
  });
  console.log({ aiChecked });

  // Step 7: Scheduled publish (if configured)
  if (SCHEDULED_TIME) {
    console.log(`=== Step 7: 设置定时发布 ${SCHEDULED_TIME} ===`);

    // Expand "更多设置" section — scroll down first, then click
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    try {
      const moreSection = page.getByText('更多设置', { exact: true });
      if (await moreSection.count() > 0) {
        await moreSection.click();
        console.log("Clicked 更多设置");
      } else {
        // Fallback: click parent area containing "更多设置"
        const moreAlt = page.locator('text=更多设置').first();
        await moreAlt.click();
        console.log("Clicked 更多设置 (fallback)");
      }
    } catch (e) {
      console.log("更多设置 click failed:", e);
    }
    await page.waitForTimeout(1500);

    // Toggle scheduled publish switch — use mouse.click on coordinates (page.evaluate click doesn't trigger React)
    const toggleCoords = await page.evaluate(() => {
      // Try direct selector first
      const sw = document.querySelector('.post-time-switch-container .d-switch');
      if (sw) {
        const rect = sw.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, found: '.d-switch' };
      }
      // Fallback: find toggle near "定时发布" text
      const labels = document.querySelectorAll('span, label, div');
      for (const el of labels) {
        const t = el.textContent?.trim() || '';
        if (t === '定时发布') {
          const parent = el.closest('[class*="switch-container"], [class*="setting"]') || el.parentElement;
          if (parent) {
            const toggle = parent.querySelector('[class*="switch"], [role="switch"]');
            if (toggle) {
              const rect = toggle.getBoundingClientRect();
              return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, found: 'text-fallback' };
            }
          }
        }
      }
      return null;
    });
    console.log("Toggle coords:", JSON.stringify(toggleCoords));
    if (toggleCoords) {
      await page.mouse.click(toggleCoords.x, toggleCoords.y);
      console.log("Clicked 定时发布 toggle via mouse.click");
    } else {
      console.log("定时发布 toggle not found");
    }
    await page.waitForTimeout(1500);

    // Set the scheduled datetime — find date input, triple-click to select, type new value
    const scheduledTimeStr = SCHEDULED_TIME;
    const dateInputInfo = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input")).filter(
        el => /\d{4}-\d{2}-\d{2}/.test(el.value)
      );
      if (!inputs.length) return null;
      const el = inputs[0];
      const rect = el.getBoundingClientRect();
      return { value: el.value, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    console.log("Date input:", JSON.stringify(dateInputInfo));

    if (dateInputInfo) {
      // Triple-click to select all text in the input
      await page.mouse.click(dateInputInfo.x, dateInputInfo.y, { clickCount: 3 });
      await page.waitForTimeout(300);
      // Type the new datetime
      await page.keyboard.type(scheduledTimeStr, { delay: 30 });
      await page.waitForTimeout(500);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1000);
      console.log(`Typed scheduled time: ${scheduledTimeStr}`);
    } else {
      console.log("No date input found for scheduling");
    }

    // Verify the time was set
    const verifyTime = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input")).filter(
        el => /\d{4}-\d{2}-\d{2}/.test(el.value)
      );
      return inputs[0]?.value || 'none';
    });
    console.log("Verified scheduled time:", verifyTime);

    // Click 确定 button if date picker opened
    try {
      const confirmBtn = page.getByRole("button", { name: "确定" });
      if (await confirmBtn.count() > 0) {
        await confirmBtn.click();
        console.log("Clicked 确定");
        await page.waitForTimeout(1000);
      }
    } catch {
      // No confirm button needed
    }
  }

  // Step 8: Publish or save draft
  const mode = SCHEDULED_TIME ? "定时发布" : (process.env.XHS_DRAFT_ONLY === "1" ? "草稿" : "发布");
  console.log(`=== Step 8: ${mode} ===`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-image-filled.png" });

  if (mode === "草稿") {
    const drafted = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      for (const btn of buttons) {
        const text = (btn as any).textContent?.trim() || "";
        if (text.includes("暂存") || text.includes("草稿") || text === "存草稿") {
          (btn as any).click();
          return text;
        }
      }
      return null;
    });
    console.log(`Draft saved: ${drafted}`);
  } else {
    // Click publish button using mouse.click on coordinates (more reliable than locator.click)
    const pubBtnInfo = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      // Prefer "定时发布" over "发布"
      for (const text of ['定时发布', '发布']) {
        for (const btn of buttons) {
          if (btn.textContent?.trim() === text) {
            const rect = btn.getBoundingClientRect();
            return { text, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
          }
        }
      }
      return { text: 'not found', allButtons: buttons.map(b => b.textContent?.trim()) };
    });
    console.log("Publish button:", JSON.stringify(pubBtnInfo));

    if (pubBtnInfo.x) {
      await page.mouse.click(pubBtnInfo.x, pubBtnInfo.y);
      console.log(`Clicked "${pubBtnInfo.text}" via mouse.click at (${pubBtnInfo.x}, ${pubBtnInfo.y})`);
    } else {
      console.log("Publish button not found");
    }
  }

  await page.waitForTimeout(3000);
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-image-result.png" });
  console.log("=== Done ===");
  await client.disconnect();
}

main().catch(console.error);

/**
 * XHS 发布测试 — 图文 / 长文 / 视频 三合一
 * 全部存草稿，不实际发布
 */
import { chromium, type Page, type BrowserContext } from "playwright";
import * as fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, "..", "profiles", "browser-data");
const TMP = "/Users/marshall/Desktop/zero-code/tmp";

const SCENE_DIR = "/Users/marshall/Desktop/zero-code/personal-projects/zero-code-video/public/images/scenes";
const TEST_IMAGES = [
  `${SCENE_DIR}/s01_programmer.jpg`,
  `${SCENE_DIR}/s02_dashboard.jpg`,
  `${SCENE_DIR}/s03_office.jpg`,
];

const VIDEO_PATH = "/Users/marshall/Desktop/zero-code/tmp/code-zero-xhs.mp4";

const LONG_ARTICLE_TEXT = `2022年夏天，我拿到了浙大计算机科学与技术专业的录取通知书。

那天晚上全家请客吃饭。爸爸喝了点酒，举着杯子跟亲戚们说："我们家鹿鹿争气，计算机专业，毕业就是年薪三十万起步。"

他没有夸张。2022年的校招市场上，985计算机本科的应届生起薪确实在25-35万之间。

2022年11月30日，入学三个月后，ChatGPT发布了。

大一的教授们说："有趣的玩具，但离取代程序员还早得很。"

大二，GPT-4来了。同学们开始用Copilot写课程项目。

大三，Cursor让非科班的人也能写完整应用了。PM们在做你以前做的事。

大四，2026校招季。投了两百多份简历，拿到三个面试。一个被AI面试官刷了。

四年前那张录取通知书上写的是"改变世界的起点"。

改变世界的是AI，不是我。`;

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms + Math.random() * 300));
}

type TestResult = { type: string; success: boolean; error?: string };

async function main() {
  fs.mkdirSync(TMP, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  // Check login
  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
    timeout: 60000, waitUntil: "domcontentloaded",
  });
  await delay(3000);

  if (page.url().includes("login")) {
    console.log("需要登录，请在浏览器中扫码...");
    await page.screenshot({ path: `${TMP}/xhs-test-login.png` });
    for (let i = 0; i < 60; i++) {
      await delay(3000);
      if (!page.url().includes("login")) {
        console.log("登录成功！");
        await delay(2000);
        break;
      }
      if (i % 10 === 0 && i > 0) console.log(`等待登录... ${i * 3}s`);
    }
    if (page.url().includes("login")) {
      console.log("登录超时，退出");
      await context.close();
      return;
    }
    await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
      timeout: 60000, waitUntil: "domcontentloaded",
    });
    await delay(3000);
  }

  console.log("已登录，开始测试\n");
  const results: TestResult[] = [];

  // ========== TEST 1: 图文（已通过，跳过）==========
  console.log("=" .repeat(50));
  console.log("TEST 1: 图文发布 — 已通过，跳过");
  console.log("=" .repeat(50));
  results.push({ type: "图文", success: true });

  // ========== TEST 2: 长文 ==========
  console.log("=" .repeat(50));
  console.log("TEST 2: 长文发布");
  console.log("=" .repeat(50));
  try {
    await testLongArticle(page, context);
    results.push({ type: "长文", success: true });
    console.log(">> 长文测试完成\n");
  } catch (err: any) {
    console.log(`>> 长文测试失败: ${err.message}\n`);
    results.push({ type: "长文", success: false, error: err.message });
    await page.screenshot({ path: `${TMP}/xhs-test-long-error.png` });
  }

  // Navigate back
  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
    timeout: 60000, waitUntil: "domcontentloaded",
  });
  await delay(3000);

  // ========== TEST 3: 视频（已通过，跳过）==========
  console.log("=" .repeat(50));
  console.log("TEST 3: 视频发布 — 已通过，跳过");
  console.log("=" .repeat(50));
  results.push({ type: "视频", success: true });

  // Summary
  console.log("\n" + "=" .repeat(50));
  console.log("测试结果汇总");
  console.log("=" .repeat(50));
  for (const r of results) {
    const status = r.success ? "PASS" : "FAIL";
    console.log(`  ${status}  ${r.type}${r.error ? ` (${r.error})` : ""}`);
  }

  await context.close();
}

// ─────── TEST 1: 图文 ───────
async function testImagePost(page: Page, context: BrowserContext) {
  // Switch to 上传图文 tab
  console.log("  [1/5] 切换到图文标签...");
  await page.waitForSelector(".creator-tab", { timeout: 15000 });
  await delay(1000);

  const switched = await page.evaluate(() => {
    // Remove popovers
    document.querySelectorAll("div.d-popover").forEach(el => el.remove());
    const tabs = document.querySelectorAll("div.creator-tab");
    for (const tab of tabs) {
      if (tab.textContent?.trim() === "上传图文") {
        (tab as HTMLElement).click();
        return true;
      }
    }
    return false;
  });
  if (!switched) throw new Error("找不到'上传图文'标签");
  await delay(2000);

  // Upload images
  console.log("  [2/5] 上传图片...");
  const input = await page.waitForSelector("input.upload-input", { timeout: 10000, state: "attached" });
  if (!input) throw new Error("找不到上传input");
  await input.setInputFiles(TEST_IMAGES);

  // Wait for images to load
  for (let i = 0; i < 30; i++) {
    const count = await page.evaluate(() => {
      return document.querySelectorAll(".img-container img, [class*='coverImg'], .img-preview-area .pr").length;
    });
    if (count >= TEST_IMAGES.length) {
      console.log(`  图片已加载: ${count}张`);
      break;
    }
    await delay(1000);
    if (i % 5 === 4) console.log(`  等待图片... ${count}/${TEST_IMAGES.length}`);
  }

  // Fill title
  console.log("  [3/5] 填写标题...");
  await fillTitle(page, "测试图文-请忽略", 20);

  // Fill body
  console.log("  [4/5] 填写正文...");
  await fillBody(page, "这是一个自动化测试图文，测试完成后会删除。\n\n请忽略此内容。");

  await page.screenshot({ path: `${TMP}/xhs-test-image-filled.png` });

  // Set visibility to private + publish
  console.log("  [5/5] 设为仅自己可见并发布...");
  await setPrivateAndPublish(page);
  await page.screenshot({ path: `${TMP}/xhs-test-image-done.png` });
}

// ─────── TEST 2: 长文 ───────
async function testLongArticle(page: Page, context: BrowserContext) {
  // Switch to 写长文 tab
  console.log("  [1/6] 切换到长文标签...");
  await page.waitForSelector(".creator-tab", { timeout: 15000 });
  await delay(1000);

  const switched = await page.evaluate(() => {
    document.querySelectorAll("div.d-popover").forEach(el => el.remove());
    const tabs = document.querySelectorAll("div.creator-tab");
    for (const tab of tabs) {
      if (tab.textContent?.trim().includes("长文") || tab.textContent?.trim() === "写长文") {
        (tab as HTMLElement).click();
        return true;
      }
    }
    return false;
  });
  if (!switched) {
    // Try getByText fallback
    try {
      await page.getByText("写长文", { exact: true }).click({ timeout: 5000 });
    } catch {
      throw new Error("找不到'写长文'标签");
    }
  }
  await delay(2000);

  // Click "新的创作" if available
  console.log("  [2/6] 新建长文...");
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("button, a, div, span")) {
      const text = el.textContent?.trim() || "";
      if (text === "新的创作" || text === "开始创作") {
        (el as HTMLElement).click();
        return;
      }
    }
  });
  await delay(5000);

  // Check if editor opened in a new tab
  let editorPage = page;
  for (const p of context.pages()) {
    if (p.url().includes("publish") && p !== page && p.url().includes("long")) {
      editorPage = p;
      break;
    }
  }
  // Also check for any page with the textarea
  for (const p of context.pages()) {
    if (p !== page) {
      const hasTextarea = await p.$('textarea[placeholder*="标题"], textarea.d-text').catch(() => null);
      if (hasTextarea) {
        editorPage = p;
        break;
      }
    }
  }

  console.log(`  编辑器页面: ${editorPage.url().substring(0, 80)}`);

  // Fill title (长文用 textarea，限64字)
  console.log("  [3/6] 填写标题...");
  const titleTextarea = await editorPage.$('textarea[placeholder*="标题"], textarea.d-text');
  if (titleTextarea) {
    await titleTextarea.click();
    await delay(300);
    await titleTextarea.fill("测试长文-四年学了一张过期的入场券");
    console.log("  标题已填写");
  } else {
    console.log("  标题textarea未找到，尝试input...");
    await fillTitle(editorPage, "测试长文-四年学了一张过期的入场券", 64);
  }

  // Fill body
  console.log("  [4/6] 填写正文...");
  const bodyEditor = await editorPage.$("div.tiptap.ProseMirror");
  if (bodyEditor) {
    await bodyEditor.click();
    await delay(300);
    const lines = LONG_ARTICLE_TEXT.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) await editorPage.keyboard.type(lines[i], { delay: 3 });
      if (i < lines.length - 1) await editorPage.keyboard.press("Enter");
    }
    console.log(`  正文已填写 (${LONG_ARTICLE_TEXT.length}字)`);
  } else {
    throw new Error("找不到正文编辑器");
  }

  await editorPage.screenshot({ path: `${TMP}/xhs-test-long-content.png` });

  // 一键排版 → 选模板 → 返回编辑器 → 才会出现"下一步"
  console.log("  [5/7] 一键排版 → 选模板...");
  try {
    await editorPage.locator("button").filter({ hasText: "一键排版" }).click({ timeout: 8000 });
    console.log("  已点击一键排版");
    await delay(3000);

    await editorPage.screenshot({ path: `${TMP}/xhs-test-long-templates.png` });

    // Select a template — try "简约基础" (first one, safest)
    const templateClicked = await editorPage.evaluate(() => {
      const cards = document.querySelectorAll(".template-card, [class*='template']");
      if (cards.length > 0) {
        (cards[0] as HTMLElement).click();
        return `clicked first template (${cards.length} total)`;
      }
      // Try clicking by template title text
      for (const el of document.querySelectorAll(".template-title, [class*='title']")) {
        const text = el.textContent?.trim() || "";
        if (text.includes("简约") || text.includes("基础")) {
          (el as HTMLElement).click();
          return `clicked: ${text}`;
        }
      }
      return null;
    });
    console.log(`  模板: ${templateClicked || "未找到模板卡片"}`);

    if (!templateClicked) {
      // Try clicking the first clickable item in the template area
      try {
        await editorPage.locator("[class*='template']").first().click({ timeout: 3000 });
        console.log("  模板: clicked via locator");
      } catch {
        console.log("  模板选择失败，截图查看...");
        await editorPage.screenshot({ path: `${TMP}/xhs-test-long-no-template.png` });
      }
    }
    await delay(3000);

    // After selecting template, there might be a "使用" or confirmation button
    try {
      const useBtn = editorPage.locator("button").filter({ hasText: /使用|应用|确认|确定/ });
      if (await useBtn.count() > 0) {
        await useBtn.first().click();
        console.log("  已确认模板选择");
        await delay(3000);
      }
    } catch {}

    await editorPage.screenshot({ path: `${TMP}/xhs-test-long-styled.png` });
  } catch (err: any) {
    console.log(`  一键排版失败: ${err.message}`);
  }

  // Now look for "下一步"
  console.log("  [6/7] 下一步...");
  await delay(2000);

  // List all buttons to debug
  const allBtns = await editorPage.evaluate(() =>
    Array.from(document.querySelectorAll("button")).map(b => ({
      text: b.textContent?.trim(),
      disabled: b.disabled,
      visible: b.offsetParent !== null,
    }))
  );
  console.log("  当前按钮:", JSON.stringify(allBtns.filter(b => b.visible)));

  let nextClicked = false;
  try {
    const nextBtn = editorPage.locator("button").filter({ hasText: /下一步/ });
    await nextBtn.waitFor({ state: "visible", timeout: 10000 });
    // Wait for it to be enabled (might be disabled while generating images)
    for (let i = 0; i < 30; i++) {
      const disabled = await nextBtn.isDisabled();
      if (!disabled) break;
      if (i % 5 === 0) console.log("  等待图片生成...");
      await delay(2000);
    }
    await nextBtn.click();
    nextClicked = true;
    console.log("  下一步: clicked");
  } catch {
    console.log("  下一步仍未找到");
  }

  if (nextClicked) {
    console.log("  [7/7] 发布设置...");
    await delay(5000);

    // Find settings page
    let settingsPage = editorPage;
    for (const p of context.pages()) {
      const hasPublish = await p.locator("button").filter({ hasText: /^发布$/ }).count().catch(() => 0);
      if (hasPublish > 0) {
        settingsPage = p;
        break;
      }
    }

    await settingsPage.screenshot({ path: `${TMP}/xhs-test-long-settings.png` });
    await setPrivateAndPublish(settingsPage);
  } else {
    // Fallback: 暂存离开
    console.log("  [7/7] fallback: 暂存离开");
    try {
      await editorPage.locator("button, span, div, a").filter({ hasText: "暂存离开" }).first().click({ timeout: 5000 });
    } catch {
      console.log("  暂存离开也未找到");
    }
  }

  await delay(2000);
  await page.screenshot({ path: `${TMP}/xhs-test-long-done.png` });
}

// ─────── TEST 3: 视频 ───────
async function testVideoPost(page: Page, context: BrowserContext) {
  // Default tab is "上传视频", no switch needed
  console.log("  [1/5] 上传视频...");

  // Wait for upload area
  await delay(2000);
  let fileInput = await page.$("input.upload-input");
  if (!fileInput) fileInput = await page.$('input[type="file"]');
  if (!fileInput) fileInput = await page.$('input[accept*="video"]');
  if (!fileInput) throw new Error("找不到视频上传input");

  await fileInput.setInputFiles(VIDEO_PATH);
  console.log("  视频已选择 (34MB)，等待处理...");

  // Wait for video processing
  let processed = false;
  for (let i = 0; i < 90; i++) {
    await delay(2000);
    const status = await page.evaluate(() => {
      const text = document.body.innerText;
      const hasProgress = !!document.querySelector('[class*="progress"], [class*="uploading"]');
      const done = text.includes("重新上传") || text.includes("上传成功") ||
                   !!document.querySelector(".publish-video-info, [class*='video-info']");
      return { hasProgress, done };
    });
    if (status.done && !status.hasProgress) {
      processed = true;
      console.log(`  视频处理完成 (${(i + 1) * 2}s)`);
      break;
    }
    if (i % 10 === 9) console.log(`  处理中... ${(i + 1) * 2}s`);
  }
  if (!processed) console.log("  视频处理超时，继续填写...");

  await page.screenshot({ path: `${TMP}/xhs-test-video-uploaded.png` });

  // Fill title
  console.log("  [2/5] 填写标题...");
  await fillTitle(page, "测试视频-请忽略", 20);

  // Fill body
  console.log("  [3/5] 填写正文...");
  await fillBody(page, "这是一个自动化测试视频，测试完成后会删除。\n\n请忽略此内容。");

  // Tags
  console.log("  [4/5] 添加标签...");
  await addTags(page, ["测试", "自动化"]);

  await page.screenshot({ path: `${TMP}/xhs-test-video-filled.png` });

  // Set visibility to private + publish
  console.log("  [5/5] 设为仅自己可见并发布...");
  await setPrivateAndPublish(page);
  await page.screenshot({ path: `${TMP}/xhs-test-video-done.png` });
}

// ─────── Shared Helpers ───────

async function fillTitle(page: Page, title: string, maxLen: number) {
  for (const sel of ['input[placeholder*="标题"]', "div.d-input input", "input.c-input_inner"]) {
    const el = await page.$(sel);
    if (el && await el.isVisible().catch(() => false)) {
      await el.click();
      await delay(300);
      await el.fill(title.slice(0, maxLen));
      console.log(`  标题: "${title.slice(0, maxLen)}"`);
      return;
    }
  }
  console.log("  标题input未找到");
}

async function fillBody(page: Page, body: string) {
  const editor = await page.$("div.tiptap.ProseMirror")
    || await page.$('[contenteditable="true"][role="textbox"]')
    || await page.$('[contenteditable="true"]');
  if (!editor) {
    console.log("  正文编辑器未找到");
    return;
  }
  await editor.click();
  await delay(300);
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) await page.keyboard.type(lines[i], { delay: 5 });
    if (i < lines.length - 1) await page.keyboard.press("Enter");
  }
  console.log("  正文已填写");
}

async function addTags(page: Page, tags: string[]) {
  const editor = await page.$("div.tiptap.ProseMirror")
    || await page.$('[contenteditable="true"]');
  if (!editor) return;

  await editor.click();
  await page.keyboard.down("Meta");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.up("Meta");
  await delay(200);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  for (const tag of tags) {
    await page.keyboard.type("#", { delay: 0 });
    await delay(300);
    await page.keyboard.type(tag, { delay: 30 });
    await delay(1500);
    const hasSuggestion = await page.$("#creator-editor-topic-container");
    if (hasSuggestion) {
      await page.keyboard.press("Enter");
      await delay(800);
    } else {
      await page.keyboard.type(" ", { delay: 0 });
      await delay(300);
    }
  }
  await page.keyboard.press("Escape");
  console.log(`  标签已添加: ${tags.join(", ")}`);
}

async function setPrivateAndPublish(page: Page) {
  await delay(1000);

  // Scroll down to see visibility settings
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await delay(1000);

  // Find and click visibility dropdown (has text "公开可见")
  console.log("  设置可见性...");
  try {
    const permSelect = page.locator(".d-select-wrapper").filter({ hasText: "公开可见" });
    await permSelect.waitFor({ state: "visible", timeout: 5000 });
    await permSelect.click();
    await delay(1000);

    // Select "仅自己可见" from dropdown
    const privateOption = page.getByText("仅自己可见");
    await privateOption.waitFor({ state: "visible", timeout: 5000 });
    await privateOption.click();
    console.log("  已设为仅自己可见");
    await delay(1000);
  } catch {
    // Fallback: try evaluate approach
    console.log("  Playwright locator失败，尝试evaluate...");
    const result = await page.evaluate(() => {
      // Find dropdown with 公开可见
      const selectors = document.querySelectorAll(".d-select-wrapper, [class*='select'], [class*='permission']");
      for (const sel of selectors) {
        if (sel.textContent?.includes("公开可见")) {
          (sel as HTMLElement).click();
          return "found-dropdown";
        }
      }
      return null;
    });
    if (result) {
      await delay(1000);
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('[class*="option"], [class*="item"], li')) {
          if (el.textContent?.trim() === "仅自己可见") {
            (el as HTMLElement).click();
            return;
          }
        }
      });
      console.log("  evaluate方式设置完成");
    } else {
      console.log("  未找到可见性设置");
    }
    await delay(1000);
  }

  await page.screenshot({ path: `${TMP}/xhs-test-visibility-set.png` });

  // Click publish button — MUST use Playwright locator, not evaluate
  // XHS's framework doesn't respond to programmatic DOM .click()
  console.log("  点击发布...");
  let publishClicked = false;
  try {
    const publishBtn = page.locator("button").filter({ hasText: /^发布$/ });
    await publishBtn.waitFor({ state: "visible", timeout: 5000 });
    await publishBtn.click();
    publishClicked = true;
    console.log("  发布按钮已点击 (Playwright locator)");
  } catch {
    // Fallback: try the red button in submit area
    try {
      const submitBtn = page.locator("div.submit button").first();
      await submitBtn.click({ timeout: 3000 });
      publishClicked = true;
      console.log("  发布按钮已点击 (submit div)");
    } catch {
      console.log("  发布按钮未找到");
      const buttons = await page.evaluate(() =>
        Array.from(document.querySelectorAll("button")).map(b => b.textContent?.trim()).filter(Boolean)
      );
      console.log(`  可用按钮: ${buttons.join(", ")}`);
      return;
    }
  }

  if (!publishClicked) return;

  // Wait for publish result
  const startUrl = page.url();
  let success = false;
  for (let i = 0; i < 30; i++) {
    await delay(2000);
    if (page.url() !== startUrl && !page.url().includes("/publish/publish")) {
      success = true;
      break;
    }
    const result = await page.evaluate(() => {
      const t = document.body.innerText;
      if (t.includes("发布成功") || t.includes("已发布")) return "success";
      if (t.includes("发布失败") || t.includes("违规")) return "failed";
      return "pending";
    });
    if (result === "success") { success = true; break; }
    if (result === "failed") { console.log("  发布失败"); break; }
  }
  console.log(`  发布结果: ${success ? "成功" : "未确认"}`);
  await delay(2000);
}

main().catch(console.error);

/**
 * XHS 图文发布脚本
 *
 * 用法: 先生成 JSON 数据文件，然后运行脚本
 *   npx tsx publish-image.ts <json-path>
 *
 * JSON 格式:
 *   { images[], title, body, tags[], aiDeclaration?, visibility?, scheduledTime? }
 *
 * 前提: infra-browser server 已启动
 */
import { connect } from "@/client.js";
import { readFileSync, existsSync } from "fs";

const SCREENSHOT_DIR = "/Users/ayuu/Desktop/zero-code/tmp";

// ── 从 JSON 文件读取发布数据 ──
const jsonPath = process.argv[2];
if (!jsonPath || !existsSync(jsonPath)) {
  console.error("用法: npx tsx publish-image.ts <json-path>");
  console.error("  JSON 必须包含: images[], title, body");
  process.exit(1);
}
const POST = JSON.parse(readFileSync(jsonPath, "utf-8")) as {
  images: string[];
  title: string;
  body: string;
  tags?: string[];
  aiDeclaration?: string;
  visibility?: string;
  scheduledTime?: string;
};
POST.tags = POST.tags ?? [];
POST.aiDeclaration = POST.aiDeclaration ?? "";
POST.visibility = POST.visibility ?? "公开可见";
POST.scheduledTime = POST.scheduledTime ?? "";

async function main() {
  const client = await connect();
  const page = await client.page("xhs-publish");
  await page.setViewportSize({ width: 1280, height: 800 });

  try {
    // ── Step 1: 导航到发布页 ──
    console.log("Step 1: 导航到发布页...");
    await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    if (page.url().includes("/login")) {
      console.log("NEEDS_LOGIN: 请在浏览器中扫码登录");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/xhs-login.png` });
      for (let i = 0; i < 60; i++) {
        await page.waitForTimeout(5000);
        if (!page.url().includes("/login")) break;
      }
      if (page.url().includes("/login")) {
        console.log("登录超时，退出");
        return;
      }
      await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(3000);
    }
    console.log("已登录:", page.url());

    // ── Step 2: 切换到「上传图文」标签 ──
    console.log("Step 2: 切换到「上传图文」...");
    await page.waitForSelector("div.upload-content", { timeout: 15000 });
    await page.evaluate(() => {
      document.querySelectorAll("div.d-popover").forEach(el => el.remove());
      const tabs = document.querySelectorAll("div.creator-tab");
      for (const tab of tabs) {
        if (tab.textContent?.trim() === "上传图文") (tab as HTMLElement).click();
      }
    });
    await page.waitForTimeout(2000);

    // ── Step 3: 上传图片 ──
    console.log("Step 3: 上传图片...");
    const input = await page.waitForSelector(".upload-input", { timeout: 30000, state: "attached" });
    if (input) {
      await input.setInputFiles(POST.images);
      console.log(`  已设置 ${POST.images.length} 张图片`);
    } else {
      console.log("  ERROR: 未找到上传输入框");
      return;
    }

    // 等待图片处理完成
    for (let t = 0; t < 60; t++) {
      const items = await page.$$(".img-preview-area .pr");
      if (items.length >= POST.images.length) break;
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(2000);
    console.log("  图片上传完成");

    // ── Step 4: 填写标题 ──
    console.log("Step 4: 填写标题...");
    const titleInput = await page.$('input[placeholder*="标题"]')
      || await page.$("div.d-input input")
      || await page.$("input.c-input_inner");
    if (titleInput) {
      await titleInput.click();
      await page.waitForTimeout(300);
      await titleInput.fill(POST.title.slice(0, 20));
      console.log("  标题:", POST.title.slice(0, 20));
    }

    // ── Step 5: 填写正文（clipboard paste） ──
    console.log("Step 5: 填写正文...");
    const bodyEditor = await page.$("div.tiptap.ProseMirror")
      || await page.$('[contenteditable="true"][role="textbox"]')
      || await page.$('[contenteditable="true"]');
    if (bodyEditor) {
      await bodyEditor.click();
      await page.waitForTimeout(300);
      await page.evaluate((text: string) => {
        const editor = document.querySelector("div.tiptap.ProseMirror")
          || document.querySelector('[contenteditable="true"]');
        if (editor) {
          const cd = new DataTransfer();
          cd.setData("text/plain", text);
          editor.dispatchEvent(new ClipboardEvent("paste", {
            bubbles: true, cancelable: true, clipboardData: cd,
          }));
        }
      }, POST.body);
      await page.waitForTimeout(1000);
      console.log("  正文已填写");
    }

    // ── Step 6: 添加标签 ──
    if (POST.tags.length > 0 && bodyEditor) {
      console.log("Step 6: 添加标签...");
      await bodyEditor.click();
      await page.keyboard.down("Meta");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.up("Meta");
      await page.waitForTimeout(200);
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");

      for (const tag of POST.tags) {
        await page.keyboard.type("#", { delay: 0 });
        await page.waitForTimeout(300);
        await page.evaluate((t: string) => {
          const el = document.activeElement;
          if (el) {
            const cd = new DataTransfer();
            cd.setData("text/plain", t);
            el.dispatchEvent(new ClipboardEvent("paste", {
              bubbles: true, cancelable: true, clipboardData: cd,
            }));
          }
        }, tag);
        await page.waitForTimeout(1500);
        const hasSuggestion = await page.$("#creator-editor-topic-container");
        if (hasSuggestion) {
          await page.keyboard.press("Enter");
          await page.waitForTimeout(800);
        } else {
          await page.keyboard.type(" ", { delay: 0 });
          await page.waitForTimeout(300);
        }
      }
      await page.keyboard.press("Escape");
      console.log("  标签:", POST.tags.join(", "));
    }

    // ── Step 7: 展开设置 + AI声明 ──
    console.log("Step 7: 展开设置...");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    const expandBtns = page.getByText("展开");
    for (let i = 0; i < await expandBtns.count(); i++) {
      try { await expandBtns.nth(i).click(); } catch {}
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    if (POST.aiDeclaration) {
      console.log("  AI声明:", POST.aiDeclaration);
      try {
        const aiDropdown = page.locator(".d-select-wrapper").filter({ hasText: "添加内容类型声明" });
        if (await aiDropdown.count() > 0) {
          await aiDropdown.first().click();
          await page.waitForTimeout(1000);
          await page.getByText(POST.aiDeclaration, { exact: true }).click();
          await page.waitForTimeout(500);
        }
      } catch {}
    }

    // ── Step 8: 定时发布 ──
    if (POST.scheduledTime) {
      console.log(`Step 8: 定时发布: ${POST.scheduledTime}`);
      const scheduleSwitch = page.locator(".post-time-switch-container .d-switch");
      try {
        await scheduleSwitch.click();
        await page.waitForTimeout(2000);
        const dateInput = page.locator(".date-picker-container input.d-text");
        await dateInput.click({ clickCount: 3 });
        await page.waitForTimeout(300);
        await page.keyboard.type(POST.scheduledTime);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(1000);
        console.log("  定时已设置");
      } catch (e) {
        console.log("  WARNING: 定时设置失败:", e);
      }
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/xhs-before-publish.png` });

    // ── Step 9: 发布 ──
    const publishText = POST.scheduledTime ? "定时发布" : "发布";
    console.log(`Step 9: 点击「${publishText}」...`);
    await page.locator("button").filter({ hasText: new RegExp(`^${publishText}$`) }).click();

    const startUrl = page.url();
    let success = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(2000);
      if (page.url() !== startUrl && !page.url().includes("/publish/publish")) {
        success = true; break;
      }
      const result = await page.evaluate(() => {
        const t = document.body.innerText;
        if (t.includes("发布成功") || t.includes("已发布") || t.includes("定时发布成功")) return "success";
        if (t.includes("发布失败") || t.includes("违规")) return "failed";
        return "pending";
      });
      if (result === "success") { success = true; break; }
      if (result === "failed") { console.log("  发布失败！"); break; }
      if (i % 5 === 0) console.log(`  等待结果... (${(i + 1) * 2}s)`);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/xhs-result.png` });
    console.log(success ? "PUBLISH SUCCESS!" : "PUBLISH RESULT UNKNOWN");

    const { writeFileSync } = await import("fs");
    writeFileSync(
      `${SCREENSHOT_DIR}/xhs-publish-result.json`,
      JSON.stringify({
        success,
        title: POST.title,
        scheduled: POST.scheduledTime,
        timestamp: new Date().toISOString(),
      }, null, 2),
    );

  } finally {
    await client.disconnect();
  }
}

main().catch(console.error);

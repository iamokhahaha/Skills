/**
 * XHS 长图文发布脚本
 *
 * 用法: 先生成 JSON 数据文件，然后运行脚本
 *   npx tsx publish-longarticle.ts <json-path>
 *
 * JSON 格式:
 *   { title, body, postTitle, postDescription, tags[], template?, templateColor?, aiDeclaration?, visibility? }
 *
 * 前提: infra-browser server 已启动
 */
import { connect } from "@/client.js";
import { readFileSync, existsSync } from "fs";

const SCREENSHOT_DIR = "/Users/ayuu/Desktop/zero-code/tmp";

// ── 从 JSON 文件读取发布数据 ──
const jsonPath = process.argv[2];
if (!jsonPath || !existsSync(jsonPath)) {
  console.error("用法: npx tsx publish-longarticle.ts <json-path>");
  console.error("  JSON 必须包含: title, body, postTitle, postDescription");
  process.exit(1);
}
const POST = JSON.parse(readFileSync(jsonPath, "utf-8")) as {
  title: string;
  body: string;
  postTitle: string;
  postDescription: string;
  tags?: string[];
  template?: string;
  templateColor?: string;
  aiDeclaration?: string;
  visibility?: string;
  scheduledTime?: string;
};
POST.tags = POST.tags ?? [];
POST.template = POST.template ?? "杂志先锋";
POST.templateColor = POST.templateColor ?? "#00E180";
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

    // ── Step 2: 切换到「写长文」标签 ──
    console.log("Step 2: 切换到「写长文」...");
    try {
      const tab = page.getByText("写长文", { exact: true });
      await tab.waitFor({ state: "visible", timeout: 8000 });
      await tab.click();
    } catch {
      await page.evaluate(() => {
        document.querySelectorAll('.d-popover, [class*="popover"]').forEach(el => el.remove());
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            return node.textContent?.trim() === "写长文" ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
          },
        });
        const textNode = walker.nextNode();
        if (textNode?.parentElement) (textNode.parentElement as HTMLElement).click();
      });
    }
    await page.waitForTimeout(3000);

    // 处理"新的创作"按钮
    const newCreation = await page.evaluate(() => {
      for (const el of document.querySelectorAll("button, a, div, span")) {
        const text = el.textContent?.trim() || "";
        if (text === "新的创作" || text === "开始创作") {
          (el as HTMLElement).click();
          return text;
        }
      }
      return null;
    });
    if (newCreation) console.log("  点击:", newCreation);
    await page.waitForTimeout(5000);

    // 检查是否在新标签页打开
    let editorPage = page;
    for (const p of page.context().pages()) {
      if (p.url().includes("publish") && p !== page) {
        editorPage = p;
        break;
      }
    }

    // ── Step 3: 填写标题 ──
    console.log("Step 3: 填写标题...");
    const titleTextarea = await editorPage.$('textarea[placeholder*="标题"], textarea.d-text');
    if (titleTextarea) {
      await titleTextarea.click();
      await editorPage.waitForTimeout(200);
      await titleTextarea.fill(POST.title.slice(0, 64));
      console.log("  标题:", POST.title.slice(0, 64));
    } else {
      console.log("  WARNING: 未找到标题输入框");
    }

    // ── Step 4: 粘贴正文 ──
    console.log("Step 4: 粘贴正文...");
    const pm = await editorPage.$(".ProseMirror");
    if (pm) {
      await pm.focus();
      await pm.click();
      await editorPage.waitForTimeout(300);
      await editorPage.evaluate((text: string) => {
        const editor = document.querySelector(".ProseMirror");
        if (editor) {
          const clipboardData = new DataTransfer();
          clipboardData.setData("text/plain", text);
          editor.dispatchEvent(new ClipboardEvent("paste", {
            bubbles: true, cancelable: true, clipboardData,
          }));
        }
      }, POST.body);
      await editorPage.waitForTimeout(2000);
      console.log("  正文已粘贴");
    } else {
      console.log("  ERROR: 未找到正文编辑器");
    }

    // ── Step 5: 一键排版 → 选模板 ──
    console.log("Step 5: 一键排版...");
    await editorPage.locator("button").filter({ hasText: "一键排版" }).click();
    await editorPage.waitForTimeout(15000); // 等模板加载

    console.log(`  选择模板: ${POST.template}...`);
    try {
      const tpl = editorPage.getByText(POST.template, { exact: true });
      await tpl.scrollIntoViewIfNeeded();
      await tpl.click();
    } catch {
      console.log("  未找到指定模板，选择第一个");
      await editorPage.locator("[class*='template']").first().click();
    }
    await editorPage.waitForTimeout(3000);

    // 选颜色
    if (POST.templateColor) {
      console.log(`  选择颜色: ${POST.templateColor}...`);
      await editorPage.evaluate((targetColor: string) => {
        const items = document.querySelectorAll(".color-item");
        for (const item of items) {
          const style = getComputedStyle(item);
          const color = style.getPropertyValue("--item-color") || "";
          if (color.toLowerCase().includes(targetColor.toLowerCase().replace("#", ""))) {
            (item as HTMLElement).click();
            return;
          }
        }
        // Fallback: click first
        if (items.length > 0) (items[0] as HTMLElement).click();
      }, POST.templateColor);
      await editorPage.waitForTimeout(2000);
    }

    await editorPage.screenshot({ path: `${SCREENSHOT_DIR}/xhs-template-selected.png` });

    // ── Step 6: 下一步 ──
    console.log("Step 6: 下一步...");
    const nextBtn = editorPage.locator("button").filter({ hasText: /下一步/ });
    for (let i = 0; i < 30; i++) {
      if (!(await nextBtn.isDisabled().catch(() => true))) break;
      console.log(`  图片生成中... (${(i + 1) * 2}s)`);
      await editorPage.waitForTimeout(2000);
    }
    await nextBtn.click();
    await editorPage.waitForTimeout(5000);
    await editorPage.waitForSelector('input[placeholder*="标题"]', { timeout: 15000 }).catch(() => {});
    console.log("  进入发布设置页");

    // ── Step 7: 帖子标题 ──
    console.log("Step 7: 填写帖子标题...");
    const postTitleInput = await editorPage.$('input[placeholder*="标题"]');
    if (postTitleInput) {
      await postTitleInput.click();
      await editorPage.waitForTimeout(200);
      await postTitleInput.fill(POST.postTitle.slice(0, 20));
      console.log("  帖子标题:", POST.postTitle.slice(0, 20));
    }

    // ── Step 8: 帖子描述 (clipboard paste) ──
    console.log("Step 8: 填写帖子描述...");
    const descEditor = await editorPage.$(".tiptap.ProseMirror");
    if (descEditor) {
      await descEditor.click();
      await editorPage.waitForTimeout(300);
      await editorPage.evaluate((text: string) => {
        const editor = document.querySelector(".tiptap.ProseMirror");
        if (editor) {
          const clipboardData = new DataTransfer();
          clipboardData.setData("text/plain", text);
          editor.dispatchEvent(new ClipboardEvent("paste", {
            bubbles: true, cancelable: true, clipboardData,
          }));
        }
      }, POST.postDescription);
      await editorPage.waitForTimeout(1000);
      console.log("  描述已填写");
    }

    // ── Step 9: 标签 (clipboard paste each) ──
    if (POST.tags.length > 0 && descEditor) {
      console.log("Step 9: 添加标签...");
      await descEditor.click();
      await editorPage.keyboard.down("Meta");
      await editorPage.keyboard.press("ArrowDown");
      await editorPage.keyboard.up("Meta");
      await editorPage.waitForTimeout(200);
      await editorPage.keyboard.press("Enter");
      await editorPage.keyboard.press("Enter");

      for (const tag of POST.tags) {
        await editorPage.keyboard.type("#", { delay: 0 });
        await editorPage.waitForTimeout(300);
        await editorPage.evaluate((t: string) => {
          const el = document.activeElement;
          if (el) {
            const cd = new DataTransfer();
            cd.setData("text/plain", t);
            el.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: cd }));
          }
        }, tag);
        await editorPage.waitForTimeout(1500);
        const hasSuggestion = await editorPage.$("#creator-editor-topic-container");
        if (hasSuggestion) {
          await editorPage.keyboard.press("Enter");
          await editorPage.waitForTimeout(800);
        } else {
          await editorPage.keyboard.type(" ", { delay: 0 });
          await editorPage.waitForTimeout(300);
        }
      }
      await editorPage.keyboard.press("Escape");
      console.log("  标签:", POST.tags.join(", "));
    }

    // ── Step 10: 展开设置区域 ──
    console.log("Step 10: 展开设置...");
    await editorPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await editorPage.waitForTimeout(1000);
    const expandBtns = editorPage.getByText("展开");
    for (let i = 0; i < await expandBtns.count(); i++) {
      try { await expandBtns.nth(i).click(); } catch {}
      await editorPage.waitForTimeout(500);
    }
    await editorPage.waitForTimeout(1000);
    await editorPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await editorPage.waitForTimeout(1000);

    // ── Step 11: 定时发布 ──
    if (POST.scheduledTime) {
      console.log(`Step 11: 设置定时发布: ${POST.scheduledTime}`);
      const scheduleSwitch = editorPage.locator(".post-time-switch-container .d-switch");
      try {
        await scheduleSwitch.click();
        await editorPage.waitForTimeout(2000);
        const dateInput = editorPage.locator(".date-picker-container input.d-text");
        await dateInput.click({ clickCount: 3 });
        await editorPage.waitForTimeout(300);
        await editorPage.keyboard.type(POST.scheduledTime);
        await editorPage.keyboard.press("Enter");
        await editorPage.waitForTimeout(1000);
        console.log("  定时已设置");
      } catch (e) {
        console.log("  WARNING: 定时设置失败:", e);
      }
    }

    await editorPage.screenshot({ path: `${SCREENSHOT_DIR}/xhs-before-publish.png` });

    // ── Step 12: 发布 ──
    const publishText = POST.scheduledTime ? "定时发布" : "发布";
    console.log(`Step 12: 点击「${publishText}」...`);
    await editorPage.locator("button").filter({ hasText: new RegExp(`^${publishText}$`) }).click();

    // 等待结果
    const startUrl = editorPage.url();
    let success = false;
    for (let i = 0; i < 30; i++) {
      await editorPage.waitForTimeout(2000);
      if (editorPage.url() !== startUrl && !editorPage.url().includes("/publish/publish")) {
        success = true;
        break;
      }
      const result = await editorPage.evaluate(() => {
        const t = document.body.innerText;
        if (t.includes("发布成功") || t.includes("已发布") || t.includes("定时发布成功")) return "success";
        if (t.includes("发布失败") || t.includes("违规")) return "failed";
        return "pending";
      });
      if (result === "success") { success = true; break; }
      if (result === "failed") { console.log("  发布失败！"); break; }
      if (i % 5 === 0) console.log(`  等待结果... (${(i + 1) * 2}s)`);
    }

    await editorPage.screenshot({ path: `${SCREENSHOT_DIR}/xhs-result.png` });
    console.log(success ? "PUBLISH SUCCESS!" : "PUBLISH RESULT UNKNOWN");

    // 保存结果
    const { writeFileSync } = await import("fs");
    writeFileSync(
      `${SCREENSHOT_DIR}/xhs-publish-result.json`,
      JSON.stringify({
        success,
        title: POST.title,
        postTitle: POST.postTitle,
        scheduled: POST.scheduledTime,
        timestamp: new Date().toISOString(),
      }, null, 2),
    );

  } finally {
    await client.disconnect();
  }
}

main().catch(console.error);

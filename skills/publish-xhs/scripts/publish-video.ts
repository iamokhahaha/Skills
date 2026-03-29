/**
 * XHS 视频发布脚本
 *
 * 用法: 先生成 JSON 数据文件，然后运行脚本
 *   npx tsx publish-video.ts <json-path>
 *
 * JSON 格式:
 *   { video, cover?, title, body, tags[], aiDeclaration?, visibility?, scheduledTime? }
 *
 * 前提: infra-browser server 已启动
 */
import { connect, setFileServerSide } from "@/client.js";
import { readFileSync, existsSync, statSync } from "fs";

const SCREENSHOT_DIR = "/Users/ayuu/Desktop/zero-code/tmp";

// ── 从 JSON 文件读取发布数据 ──
const jsonPath = process.argv[2];
if (!jsonPath || !existsSync(jsonPath)) {
  console.error("用法: npx tsx publish-video.ts <json-path>");
  console.error("  JSON 必须包含: video, title, body");
  process.exit(1);
}
const POST = JSON.parse(readFileSync(jsonPath, "utf-8")) as {
  video: string;
  cover?: string;
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

    // ── Step 2: 上传视频（默认标签页"上传视频"，无需切换） ──
    console.log("Step 2: 上传视频...");
    await page.waitForTimeout(2000);
    const uploadInput = await page.$("input.upload-input")
      || await page.$('input[type="file"]')
      || await page.$('input[accept*="video"]');
    if (!uploadInput) {
      console.log("ERROR: 未找到上传输入框");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/xhs-no-upload.png` });
      return;
    }
    const fileSize = statSync(POST.video).size;
    if (fileSize > 50 * 1024 * 1024) {
      console.log(`  文件 ${(fileSize / 1024 / 1024).toFixed(0)}MB，使用 server-side 上传...`);
      const result = await setFileServerSide("xhs-publish", POST.video, {
        selector: "input.upload-input, input[type='file'], input[accept*='video']",
      });
      if (!result.success) {
        console.log("  ERROR: server-side 上传失败:", result.error);
        return;
      }
    } else {
      await uploadInput.setInputFiles(POST.video);
    }
    console.log("  视频文件已设置，等待上传处理...");

    // 等待视频处理完成（最多10分钟）
    let processed = false;
    for (let i = 0; i < 200; i++) {
      await page.waitForTimeout(3000);
      const status = await page.evaluate(() => {
        const text = document.body.innerText;
        const uploading = text.includes("上传中") || text.includes("%");
        const done = !!document.querySelector(".publish-video-info")
          || text.includes("重新上传")
          || !!document.querySelector('input[placeholder*="标题"]');
        return { uploading, done };
      });
      if (status.done && !status.uploading) { processed = true; break; }
      if (i % 20 === 0) {
        console.log(`  上传中... (${(i + 1) * 3}s)`);
        await page.screenshot({ path: `${SCREENSHOT_DIR}/xhs-upload-${i}.png` });
      }
    }
    if (!processed) console.log("  WARNING: 上传可能未完成，继续...");
    console.log("  视频上传完成");

    // ── Step 3: 填写标题 ──
    console.log("Step 3: 填写标题...");
    await page.waitForTimeout(2000);
    const titleInput = await page.$('input[placeholder*="标题"]')
      || await page.$("div.d-input input")
      || await page.$("input.c-input_inner");
    if (titleInput) {
      await titleInput.click();
      await page.waitForTimeout(300);
      await titleInput.fill(POST.title.slice(0, 20));
      console.log("  标题:", POST.title.slice(0, 20));
    } else {
      console.log("  WARNING: 未找到标题输入框");
    }

    // ── Step 4: 填写正文（clipboard paste） ──
    console.log("Step 4: 填写正文...");
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

    // ── Step 5: 添加标签 ──
    if (POST.tags.length > 0 && bodyEditor) {
      console.log("Step 5: 添加标签...");
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

    // ── Step 6: 封面（可选） ──
    if (POST.cover && existsSync(POST.cover)) {
      console.log("Step 6: 设置封面...");
      await page.waitForTimeout(2000);

      // 等待封面按钮出现（视频处理完成后才会显示）
      let coverClicked: string | null = null;
      for (let i = 0; i < 10; i++) {
        coverClicked = await page.evaluate(() => {
          for (const el of document.querySelectorAll("span, div, button, a")) {
            const text = el.textContent?.trim() || "";
            if ((text === "设置封面" || text === "修改封面" || text === "更改封面") && el.childElementCount <= 2) {
              (el as HTMLElement).click();
              return text;
            }
          }
          return null;
        });
        if (coverClicked) break;
        await page.waitForTimeout(2000);
        if (i % 3 === 2) console.log(`  等待封面按钮... (${(i+1)*2}s)`);
      }

      if (coverClicked) {
        console.log(`  点击: ${coverClicked}`);
        await page.waitForTimeout(2000);

        // 点击"上传图片"
        await page.evaluate(() => {
          for (const el of document.querySelectorAll("span, div, button, a")) {
            const text = el.textContent?.trim() || "";
            if ((text === "上传图片" || text === "+ 上传图片" || text === "上传封面") && el.childElementCount <= 2) {
              (el as HTMLElement).click();
              return;
            }
          }
        });
        await page.waitForTimeout(2000);

        // 等待 image input 出现（弹窗可能延迟渲染）
        let coverInput: Awaited<ReturnType<typeof page.$>> = null;
        for (let i = 0; i < 5; i++) {
          coverInput = await page.$('input[accept*="image"]');
          if (coverInput) break;
          await page.waitForTimeout(1000);
        }

        if (coverInput) {
          await coverInput.setInputFiles(POST.cover);
          console.log("  封面图片已上传");
          await page.waitForTimeout(3000);

          // 点击确认按钮
          await page.evaluate(() => {
            for (const btn of document.querySelectorAll("button")) {
              const t = btn.textContent?.trim();
              if (t === "确定" || t === "确认" || t === "完成") {
                (btn as HTMLElement).click();
                return;
              }
            }
          });
          await page.waitForTimeout(1000);
          console.log("  封面已设置");
        } else {
          console.log("  WARNING: 未找到封面上传 input");
          await page.screenshot({ path: `${SCREENSHOT_DIR}/xhs-cover-no-input.png` });
        }
      } else {
        console.log("  WARNING: 未找到封面按钮（视频可能仍在处理）");
        await page.screenshot({ path: `${SCREENSHOT_DIR}/xhs-cover-no-btn.png` });
      }
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

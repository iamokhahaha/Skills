/**
 * B站专栏文章发布脚本（Playwright 浏览器自动化）
 *
 * 用法: 修改 POST 对象后运行
 *   cd ~/.claude/skills/auto-dev-browser
 *   PATH="./node_modules/.bin:$PATH" tsx ~/.claude/skills/media-bilibili-publish/scripts/publish-article.ts
 *
 * 前提: dev-browser server 已启动，B站已登录
 */
import { connect } from "@/client.js";
import * as fs from "fs";

const SCREENSHOT_DIR = "/Users/ayuu/Desktop/zero-code/tmp";

const POST = {
  // ── 内容 ──
  title: "",              // 标题（≤ 80 字）
  body: "",               // 正文（纯文本，≤ 2000 字）
  bodyHtml: "",           // 正文（HTML 格式，优先使用；为空则用 body）

  // ── 可选设置 ──
  cover: "",              // 封面图路径（可选）
  draft: false,           // true=存草稿, false=直接发布
};

async function main() {
  // ── 验证输入 ──
  if (!POST.title) {
    console.log("ERROR: 标题不能为空");
    process.exit(1);
  }
  if (!POST.body && !POST.bodyHtml) {
    console.log("ERROR: 正文不能为空（body 或 bodyHtml 至少填一个）");
    process.exit(1);
  }

  const client = await connect();
  const page = await client.page("bilibili-publish");
  await page.setViewportSize({ width: 1280, height: 800 });

  try {
    // ── Step 1: 导航到专栏编辑页 ──
    console.log("Step 1: 导航到专栏编辑页...");
    await page.goto("https://member.bilibili.com/platform/upload/text/edit", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // 检查登录
    if (page.url().includes("passport.bilibili.com") || page.url().includes("/login")) {
      console.log("NEEDS_LOGIN: 请在浏览器中登录B站");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/bilibili-login.png` });
      for (let i = 0; i < 60; i++) {
        await page.waitForTimeout(5000);
        if (!page.url().includes("passport") && !page.url().includes("/login")) break;
      }
      if (page.url().includes("passport") || page.url().includes("/login")) {
        console.log("登录超时，退出");
        return;
      }
      await page.goto("https://member.bilibili.com/platform/upload/text/edit", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(3000);
    }
    console.log("  已进入编辑页:", page.url());

    // ── Step 2: 填写标题 ──
    console.log("Step 2: 填写标题...");
    // 尝试多种选择器
    const titleSelectors = [
      '[data-placeholder*="标题"]',
      '[placeholder*="标题"]',
      '.article-title input',
      '.title-input input',
      'input[maxlength]',
    ];
    let titleFilled = false;
    for (const sel of titleSelectors) {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        await page.waitForTimeout(200);
        // 用 clipboard paste 填标题，避免 keyboard.type 对中文不稳定
        await page.evaluate((text: string) => {
          const active = document.activeElement as HTMLInputElement;
          if (active) {
            if ('value' in active) {
              // input 元素
              const nativeSetter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype, 'value'
              )?.set;
              nativeSetter?.call(active, text);
              active.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
              // contenteditable 元素
              const cd = new DataTransfer();
              cd.setData("text/plain", text);
              active.dispatchEvent(new ClipboardEvent("paste", {
                bubbles: true, cancelable: true, clipboardData: cd,
              }));
            }
          }
        }, POST.title.slice(0, 80));
        titleFilled = true;
        console.log("  标题:", POST.title.slice(0, 80));
        break;
      }
    }
    if (!titleFilled) {
      console.log("  WARNING: 未找到标题输入框，尝试 keyboard.type...");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/bilibili-no-title.png` });
      // 降级: 尝试 Tab 到标题位置
      await page.keyboard.press("Tab");
      await page.waitForTimeout(300);
      await page.keyboard.type(POST.title.slice(0, 80), { delay: 10 });
    }
    await page.waitForTimeout(500);

    // ── Step 3: 填写正文 ──
    console.log("Step 3: 填写正文...");
    const bodySelectors = [
      '.ql-editor',
      '[data-placeholder*="正文"]',
      '[contenteditable="true"]',
      '.ProseMirror',
    ];
    let bodyFilled = false;
    for (const sel of bodySelectors) {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        await page.waitForTimeout(300);
        const content = POST.bodyHtml || POST.body;
        const isHtml = !!POST.bodyHtml;

        await page.evaluate(({ text, html }: { text: string; html: boolean }) => {
          const editor = document.querySelector('.ql-editor')
            || document.querySelector('[contenteditable="true"]');
          if (editor) {
            const cd = new DataTransfer();
            if (html) {
              cd.setData("text/html", text);
              cd.setData("text/plain", text.replace(/<[^>]*>/g, ''));
            } else {
              cd.setData("text/plain", text);
            }
            editor.dispatchEvent(new ClipboardEvent("paste", {
              bubbles: true, cancelable: true, clipboardData: cd,
            }));
          }
        }, { text: content, html: isHtml });

        bodyFilled = true;
        console.log("  正文已填写", isHtml ? "(HTML)" : "(纯文本)");
        break;
      }
    }
    if (!bodyFilled) {
      console.log("  ERROR: 未找到正文编辑器");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/bilibili-no-body.png` });
    }
    await page.waitForTimeout(1000);

    // ── Step 4: 封面（可选） ──
    if (POST.cover && fs.existsSync(POST.cover)) {
      console.log("Step 4: 上传封面...");
      const coverInput = await page.$('input[type="file"][accept*="image"]');
      if (coverInput) {
        await coverInput.setInputFiles(POST.cover);
        await page.waitForTimeout(3000);
        console.log("  封面已设置");
      } else {
        // 尝试点击上传封面按钮触发 file chooser
        const uploadBtn = await page.evaluate(() => {
          for (const el of document.querySelectorAll("span, div, button")) {
            if (el.textContent?.includes("上传封面") || el.textContent?.includes("添加封面")) {
              (el as HTMLElement).click();
              return true;
            }
          }
          return false;
        });
        if (uploadBtn) {
          await page.waitForTimeout(1000);
          const coverInput2 = await page.$('input[type="file"][accept*="image"]');
          if (coverInput2) {
            await coverInput2.setInputFiles(POST.cover);
            await page.waitForTimeout(3000);
            console.log("  封面已设置");
          }
        } else {
          console.log("  WARNING: 未找到封面上传入口");
        }
      }
    } else {
      console.log("Step 4: 跳过封面");
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/bilibili-article-before-publish.png` });

    // ── Step 5: 发布 / 存草稿 ──
    const action = POST.draft ? "存草稿" : "发布";
    console.log(`Step 5: ${action}...`);

    if (POST.draft) {
      // 存草稿
      const draftClicked = await page.evaluate(() => {
        const targets = ["保存为草稿", "保存草稿", "存草稿"];
        for (const el of document.querySelectorAll('button, [role="button"], span')) {
          if (targets.some(t => el.textContent?.includes(t))) {
            (el as HTMLElement).click();
            return true;
          }
        }
        return false;
      });
      if (!draftClicked) {
        // 降级: 使用 Playwright locator
        try {
          await page.getByText("保存为草稿").first().click();
        } catch {
          try {
            await page.getByText("存草稿").first().click();
          } catch {
            console.log("  WARNING: 未找到草稿按钮");
          }
        }
      }
    } else {
      // 直接发布 — 使用 Playwright locator（不用 page.evaluate 点击）
      try {
        await page.locator('button').filter({ hasText: /^发布$/ }).click();
      } catch {
        // 降级策略
        try {
          await page.getByText("发布", { exact: true }).click();
        } catch {
          const publishClicked = await page.evaluate(() => {
            for (const btn of document.querySelectorAll("button")) {
              if (btn.textContent?.trim() === "发布") {
                btn.click();
                return true;
              }
            }
            return false;
          });
          if (!publishClicked) {
            console.log("  ERROR: 未找到发布按钮");
            await page.screenshot({ path: `${SCREENSHOT_DIR}/bilibili-no-publish-btn.png` });
          }
        }
      }
    }

    // 等待结果
    await page.waitForTimeout(3000);
    let success = false;

    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(2000);
      const result = await page.evaluate(() => {
        const t = document.body.innerText;
        if (t.includes("发布成功") || t.includes("保存成功") || t.includes("已保存")) return "success";
        if (t.includes("发布失败") || t.includes("保存失败")) return "failed";
        return "pending";
      });
      if (result === "success") { success = true; break; }
      if (result === "failed") { console.log("  发布失败！"); break; }

      // 检查是否跳转到了草稿列表页
      if (page.url().includes("/article-text/home") || page.url().includes("/draft")) {
        success = true;
        break;
      }
      if (i % 5 === 0) console.log(`  等待结果... (${(i + 1) * 2}s)`);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/bilibili-article-result.png` });
    console.log(success ? `${action}成功!` : `${action}结果未知`);

    fs.writeFileSync(
      `${SCREENSHOT_DIR}/bilibili-publish-result.json`,
      JSON.stringify({
        success,
        type: "article",
        draft: POST.draft,
        title: POST.title,
        timestamp: new Date().toISOString(),
      }, null, 2),
    );

  } finally {
    await client.disconnect();
  }
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  fs.writeFileSync(
    `${SCREENSHOT_DIR}/bilibili-publish-result.json`,
    JSON.stringify({
      success: false,
      type: "article",
      error: e.message,
      timestamp: new Date().toISOString(),
    }, null, 2),
  );
  process.exit(1);
});

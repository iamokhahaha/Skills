/**
 * 微信公众号长文章（图文消息）发布脚本
 *
 * 用法: 修改 POST 对象后运行
 *   cd ~/.claude/skills/auto-dev-browser
 *   PATH="./node_modules/.bin:$PATH" tsx ~/.claude/skills/media-wechat-publish/scripts/publish-article.ts
 *
 * 前提: dev-browser server 已启动，公众号已登录
 * 流程: 编辑器填写 → 保存草稿 → 草稿箱群发
 */
import { connect, waitForPageLoad } from "@/client.js";
import * as fs from "fs";

const SCREENSHOT_DIR = "/Users/ayuu/Desktop/zero-code/tmp";

const POST = {
  // ── 内容 ──
  title: "",               // 文章标题
  author: "",              // 作者（可选）
  bodyHtml: "",            // 正文 HTML（支持富文本、图片、视频嵌入）
  body: "",                // 正文纯文本（bodyHtml 为空时使用）
  cover: "",               // 封面图路径（可选，建议 2.35:1 即 900×383）
  digest: "",              // 摘要（可选，≤120字，留空则自动截取正文前54字）

  // ── 设置 ──
  originalDeclare: false,  // 是否声明原创
  massSend: true,          // true=保存后立即群发, false=仅保存草稿
};

async function main() {
  if (!POST.title) { console.log("ERROR: 标题不能为空"); process.exit(1); }
  if (!POST.bodyHtml && !POST.body) { console.log("ERROR: 正文不能为空"); process.exit(1); }

  const client = await connect();
  const page = await client.page("wechat-publish");
  await page.setViewportSize({ width: 1280, height: 800 });
  page.on("dialog", async (d) => { await d.accept(); });

  try {
    // ── Step 1: 登录 & Token ──
    console.log("Step 1: 检查登录...");
    await page.goto("https://mp.weixin.qq.com/", {
      waitUntil: "domcontentloaded", timeout: 60000,
    });
    await page.waitForTimeout(3000);

    if (page.url().includes("/login") || page.url().includes("scanlogin")) {
      console.log("NEEDS_LOGIN: 请在浏览器中扫码登录公众号");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-login-qr.png` });
      for (let i = 0; i < 300; i++) {
        await page.waitForTimeout(1000);
        if (page.url().includes("/cgi-bin/home") || page.url().includes("/cgi-bin/frame")) break;
      }
      if (page.url().includes("/login")) { console.log("登录超时"); return; }
    }

    const token = page.url().match(/token=(\d+)/)?.[1] || "";
    if (!token) { console.log("ERROR: 无法提取 token"); return; }
    console.log("  Token:", token);

    // ── Step 2: 打开图文编辑器 ──
    console.log("Step 2: 打开图文编辑器...");
    await page.goto(
      `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&token=${token}`,
      { waitUntil: "domcontentloaded", timeout: 30000 },
    );
    await page.waitForTimeout(5000);
    console.log("  编辑器已打开");

    // ── Step 3: 填写标题 ──
    console.log("Step 3: 填写标题...");
    const titleSelectors = [
      '#title',
      'textarea[placeholder*="标题"]',
      '.title_input textarea',
      '[id*="title"]',
    ];
    let titleFilled = false;
    for (const sel of titleSelectors) {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        await el.click();
        await page.waitForTimeout(300);
        await el.fill(POST.title);
        titleFilled = true;
        console.log("  标题:", POST.title);
        break;
      }
    }
    if (!titleFilled) {
      console.log("  WARNING: 未找到标题输入框");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-article-no-title.png` });
    }

    // ── Step 4: 填写作者（可选） ──
    if (POST.author) {
      console.log("Step 4: 填写作者...");
      const authorInput = await page.$('#author')
        || await page.$('input[placeholder*="作者"]')
        || await page.$('.author_input input');
      if (authorInput) {
        await authorInput.fill(POST.author);
        console.log("  作者:", POST.author);
      }
    }

    // ── Step 5: 填写正文（富文本） ──
    console.log("Step 5: 填写正文...");
    // 公众号编辑器正文区域是一个 iframe 内的 contenteditable body
    // 或者是 .edui-body-container / #ueditor_0 / .rich_media_content 等
    const content = POST.bodyHtml || POST.body;
    const isHtml = !!POST.bodyHtml;

    // 策略1: 找编辑器 iframe
    let bodyFilled = false;
    const iframes = page.frames();
    for (const frame of iframes) {
      try {
        const editable = await frame.$('body[contenteditable="true"], [contenteditable="true"]');
        if (editable) {
          await editable.click();
          await frame.waitForTimeout(300);
          await frame.evaluate(({ text, html }: { text: string; html: boolean }) => {
            const editor = document.querySelector('body[contenteditable="true"]')
              || document.querySelector('[contenteditable="true"]');
            if (!editor) return;
            const cd = new DataTransfer();
            if (html) {
              cd.setData("text/html", text);
              cd.setData("text/plain", text.replace(/<[^>]*>/g, ""));
            } else {
              const htmlContent = text.split("\n").map((l: string) => `<p>${l || "<br>"}</p>`).join("");
              cd.setData("text/html", htmlContent);
              cd.setData("text/plain", text);
            }
            editor.dispatchEvent(new ClipboardEvent("paste", {
              clipboardData: cd, bubbles: true, cancelable: true,
            }));
          }, { text: content, html: isHtml });
          bodyFilled = true;
          console.log("  正文已填写 (iframe)", isHtml ? "(HTML)" : "(纯文本)");
          break;
        }
      } catch {}
    }

    // 策略2: 主 page 上找编辑器
    if (!bodyFilled) {
      const editorSelectors = [
        '.edui-body-container',
        '#js_editor',
        '[contenteditable="true"]',
        '.ProseMirror',
      ];
      for (const sel of editorSelectors) {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
          await el.click();
          await page.waitForTimeout(300);
          await page.evaluate(({ text, html, selector }: { text: string; html: boolean; selector: string }) => {
            const editor = document.querySelector(selector);
            if (!editor) return;
            const cd = new DataTransfer();
            if (html) {
              cd.setData("text/html", text);
              cd.setData("text/plain", text.replace(/<[^>]*>/g, ""));
            } else {
              const htmlContent = text.split("\n").map((l: string) => `<p>${l || "<br>"}</p>`).join("");
              cd.setData("text/html", htmlContent);
              cd.setData("text/plain", text);
            }
            editor.dispatchEvent(new ClipboardEvent("paste", {
              clipboardData: cd, bubbles: true, cancelable: true,
            }));
          }, { text: content, html: isHtml, selector: sel });
          bodyFilled = true;
          console.log("  正文已填写", isHtml ? "(HTML)" : "(纯文本)");
          break;
        }
      }
    }

    if (!bodyFilled) {
      console.log("  ERROR: 未找到正文编辑器");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-article-no-editor.png` });
    }

    // ── Step 6: 封面图（可选） ──
    if (POST.cover && fs.existsSync(POST.cover)) {
      console.log("Step 6: 上传封面...");
      // 点击封面区域
      const coverArea = await page.evaluate(() => {
        for (const el of document.querySelectorAll("div, span, a, button")) {
          const t = el.textContent?.trim() || "";
          if (t.includes("上传封面") || t.includes("选择封面") || t.includes("封面")) {
            if (el.childElementCount <= 3) {
              (el as HTMLElement).click();
              return t;
            }
          }
        }
        return null;
      });
      if (coverArea) {
        await page.waitForTimeout(2000);
        const coverInput = await page.$('input[type="file"][accept*="image"]');
        if (coverInput) {
          await coverInput.setInputFiles(POST.cover);
          await page.waitForTimeout(3000);
          // 确认封面
          await page.evaluate(() => {
            for (const btn of document.querySelectorAll("button, a")) {
              const t = btn.textContent?.trim() || "";
              if (["确定", "完成", "确认"].includes(t)) { (btn as HTMLElement).click(); return; }
            }
          });
          await page.waitForTimeout(1000);
          console.log("  封面已上传");
        }
      } else {
        console.log("  WARNING: 未找到封面上传区域");
      }
    }

    // ── Step 7: 摘要（可选） ──
    if (POST.digest) {
      const digestInput = await page.$('textarea[placeholder*="摘要"]')
        || await page.$('#digest');
      if (digestInput) {
        await digestInput.fill(POST.digest.slice(0, 120));
        console.log("  摘要:", POST.digest.slice(0, 50) + "...");
      }
    }

    // ── Step 8: 原创声明（可选） ──
    if (POST.originalDeclare) {
      console.log("Step 8: 声明原创...");
      await page.evaluate(() => {
        for (const el of document.querySelectorAll("label, span, div")) {
          if (el.textContent?.includes("原创") && el.childElementCount <= 2) {
            (el as HTMLElement).click();
            return;
          }
        }
      });
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-article-before-save.png` });

    // ── Step 9: 保存草稿 ──
    console.log("Step 9: 保存草稿...");
    let saved = false;
    // 方式1: Playwright locator
    try {
      await page.getByText("保存", { exact: true }).first().click();
      saved = true;
    } catch {}
    // 方式2: evaluate
    if (!saved) {
      saved = !!await page.evaluate(() => {
        for (const btn of document.querySelectorAll("button, a")) {
          if (btn.textContent?.trim() === "保存") { (btn as HTMLElement).click(); return true; }
        }
        return false;
      });
    }

    await page.waitForTimeout(3000);
    const saveResult = await page.evaluate(() => {
      const t = document.body.innerText;
      return t.includes("保存成功") || t.includes("已保存");
    });
    console.log(saveResult ? "  草稿已保存" : "  WARNING: 保存结果未确认");

    if (!POST.massSend) {
      console.log("仅保存草稿，跳过群发");
      fs.writeFileSync(`${SCREENSHOT_DIR}/wechat-publish-result.json`, JSON.stringify({
        success: saveResult, type: "article", draft: true, title: POST.title, timestamp: new Date().toISOString(),
      }, null, 2));
      return;
    }

    // ── Step 10: 导航到草稿箱 → 群发 ──
    console.log("Step 10: 打开草稿箱...");
    await page.goto(
      `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_list&action=list_card&type=10&token=${token}`,
      { waitUntil: "domcontentloaded", timeout: 30000 },
    );
    await waitForPageLoad(page);
    await page.waitForTimeout(3000);

    // hover 第一条草稿
    const firstCard = await page.$(".weui-desktop-card, .card_appmsg_normal, [class*='appmsg_item']");
    if (!firstCard) {
      console.log("  WARNING: 草稿箱为空或选择器失效");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-drafts-empty.png` });
      return;
    }

    await firstCard.hover();
    await page.waitForTimeout(1000);

    // 点击群发
    let massSendClicked = false;
    try {
      await page.getByText("群发", { exact: true }).first().click();
      massSendClicked = true;
    } catch {
      massSendClicked = !!await page.evaluate(() => {
        for (const el of document.querySelectorAll("a, button, span")) {
          if (el.textContent?.trim() === "群发") { (el as HTMLElement).click(); return true; }
        }
        return false;
      });
    }

    if (!massSendClicked) {
      // 降级: hover 后查找
      await firstCard.hover();
      await page.waitForTimeout(800);
      const sendBtn = await page.$('a[title="群发"], [class*="send"]');
      if (sendBtn) { await sendBtn.click(); massSendClicked = true; }
    }

    if (massSendClicked) {
      console.log("  已点击群发");
      await page.waitForTimeout(2000);

      // 确认对话框
      await page.evaluate(() => {
        for (const btn of document.querySelectorAll("button, a")) {
          const t = btn.textContent?.trim() || "";
          if (["发送", "确定", "群发"].includes(t)) { (btn as HTMLElement).click(); return; }
        }
      });

      // 管理员验证
      await page.waitForTimeout(3000);
      const needsVerify = await page.evaluate(() =>
        window.location.href.includes("safeverify") || !!document.querySelector('img[src*="qrcode"]')
      );
      if (needsVerify) {
        console.log("  需要管理员扫码验证");
        await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-masssend-verify.png` });
        for (let i = 0; i < 120; i++) {
          await page.waitForTimeout(1000);
          const done = await page.evaluate(() =>
            !window.location.href.includes("safeverify") && !document.querySelector('img[src*="qrcode"]')
          );
          if (done) break;
        }
      }

      await page.waitForTimeout(3000);
      const result = await page.evaluate(() => {
        const t = document.body.innerText;
        if (t.includes("发送成功") || t.includes("群发成功")) return "success";
        if (t.includes("失败")) return "failed";
        return "unknown";
      });

      const success = result === "success";
      console.log(success ? "PUBLISH SUCCESS!" : `群发结果: ${result}`);

      fs.writeFileSync(`${SCREENSHOT_DIR}/wechat-publish-result.json`, JSON.stringify({
        success, type: "article", title: POST.title, timestamp: new Date().toISOString(),
      }, null, 2));
    } else {
      console.log("  WARNING: 未找到群发按钮");
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-publish-result.png` });

  } finally {
    await client.disconnect();
  }
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  fs.writeFileSync(`${SCREENSHOT_DIR}/wechat-publish-result.json`, JSON.stringify({
    success: false, type: "article", error: e.message, timestamp: new Date().toISOString(),
  }, null, 2));
  process.exit(1);
});

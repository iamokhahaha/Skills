/**
 * 微信公众号贴图（图片帖）发布脚本
 *
 * 用法: 修改 POST 对象后运行
 *   cd ~/.claude/skills/auto-dev-browser
 *   PATH="./node_modules/.bin:$PATH" tsx ~/.claude/skills/media-wechat-publish/scripts/publish-post.ts
 *
 * 前提: dev-browser server 已启动，公众号已登录
 */
import { connect, waitForPageLoad } from "@/client.js";
import * as fs from "fs";

const SCREENSHOT_DIR = "/Users/ayuu/Desktop/zero-code/tmp";

const POST = {
  // ── 素材 ──
  images: [] as string[],   // 图片文件路径（1-9张，≤10MB/张）

  // ── 内容 ──
  title: "",                 // 标题（≤ 20 字）
  body: "",                  // 描述正文
};

async function main() {
  if (!POST.title) { console.log("ERROR: 标题不能为空"); process.exit(1); }
  if (POST.images.length === 0) { console.log("ERROR: 图片不能为空"); process.exit(1); }

  const client = await connect();
  const page = await client.page("wechat-publish");
  await page.setViewportSize({ width: 1280, height: 800 });
  page.on("dialog", async (d) => { await d.accept(); });

  try {
    // ── Step 1: 登录 & 获取 Token ──
    console.log("Step 1: 检查登录...");
    await page.goto("https://mp.weixin.qq.com/", {
      waitUntil: "domcontentloaded", timeout: 60000,
    });
    await page.waitForTimeout(3000);

    let url = page.url();
    if (url.includes("/login") || url.includes("action=scanlogin")) {
      console.log("NEEDS_LOGIN: 请在浏览器中扫码登录公众号");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-login-qr.png` });
      for (let i = 0; i < 300; i++) {
        await page.waitForTimeout(1000);
        if (page.url().includes("/cgi-bin/home") || page.url().includes("/cgi-bin/frame")) break;
      }
      url = page.url();
      if (url.includes("/login")) { console.log("登录超时"); return; }
    }

    const token = page.url().match(/token=(\d+)/)?.[1] || "";
    if (!token) {
      console.log("ERROR: 无法提取 token");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-no-token.png` });
      return;
    }
    console.log("  Token:", token);

    // ── Step 2: 导航到贴图编辑器 ──
    console.log("Step 2: 打开贴图编辑器...");
    await page.goto(
      `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=8&token=${token}`,
      { waitUntil: "domcontentloaded", timeout: 30000 },
    );
    await page.waitForTimeout(3000);

    // ── Step 3: 上传图片 ──
    console.log("Step 3: 上传图片...");
    const addArea = await page.$(".image-selector__add");
    if (addArea) {
      await addArea.hover();
      await page.waitForTimeout(500);
      const uploadLink = await page.$(".pop-opr__group-select-image .weui-desktop-upload__btn__wrp a");
      if (uploadLink) {
        const [fileChooser] = await Promise.all([
          page.waitForEvent("filechooser", { timeout: 8000 }),
          uploadLink.click(),
        ]);
        await fileChooser.setFiles(POST.images.slice(0, 9));
      } else {
        // 降级: 直接找 file input
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) await fileInput.setInputFiles(POST.images.slice(0, 9));
      }
    } else {
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) await fileInput.setInputFiles(POST.images.slice(0, 9));
      else {
        console.log("ERROR: 未找到图片上传入口");
        await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-no-upload.png` });
        return;
      }
    }
    await page.waitForTimeout(5000);
    console.log(`  已上传 ${POST.images.length} 张图片`);

    // ── Step 4: 填标题 ──
    console.log("Step 4: 填写标题...");
    const titleEl = await page.$("#title");
    if (titleEl) {
      await titleEl.fill(POST.title.slice(0, 20));
      console.log("  标题:", POST.title.slice(0, 20));
    } else {
      console.log("  WARNING: 未找到 #title");
    }

    // ── Step 5: 填描述 ──
    if (POST.body) {
      console.log("Step 5: 填写描述...");
      const pm = await page.$(".ProseMirror");
      if (pm) {
        await pm.click();
        await page.waitForTimeout(300);
        await page.evaluate((text: string) => {
          const editor = document.querySelector(".ProseMirror");
          if (!editor) return;
          const html = text.split("\n").map((l) => `<p>${l || "<br>"}</p>`).join("");
          const dt = new DataTransfer();
          dt.setData("text/html", html);
          editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
        }, POST.body);
        console.log("  描述已填写");
      }
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-article-before-publish.png` });

    // ── Step 6: 发表 ──
    console.log("Step 6: 点击发表...");
    let publishClicked = false;
    try {
      await page.getByText("发表", { exact: true }).first().click();
      publishClicked = true;
    } catch {
      const clicked = await page.evaluate(() => {
        for (const btn of document.querySelectorAll("button, a, .weui-desktop-btn")) {
          if (btn.textContent?.trim() === "发表") { (btn as HTMLElement).click(); return true; }
        }
        return false;
      });
      publishClicked = !!clicked;
    }
    if (!publishClicked) {
      console.log("  ERROR: 未找到发表按钮");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-no-publish-btn.png` });
      return;
    }

    // 确认弹窗
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      for (const btn of document.querySelectorAll("button, a")) {
        const t = btn.textContent?.trim() || "";
        if (["确定", "确认发表", "继续保存"].includes(t)) { (btn as HTMLElement).click(); return; }
      }
    });

    // 管理员扫码验证
    await page.waitForTimeout(3000);
    const needsVerify = await page.evaluate(() =>
      window.location.href.includes("safeverify") || !!document.querySelector('img[src*="qrcode"]')
    );
    if (needsVerify) {
      console.log("  需要管理员扫码验证，请在微信中确认");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-verify-qr.png` });
      for (let i = 0; i < 120; i++) {
        await page.waitForTimeout(1000);
        const done = await page.evaluate(() =>
          !window.location.href.includes("safeverify") && !document.querySelector('img[src*="qrcode"]')
        );
        if (done) break;
      }
    }

    // 等待结果
    let success = false;
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(2000);
      const result = await page.evaluate(() => {
        const t = document.body.innerText;
        if (t.includes("发送成功") || t.includes("发表成功") || t.includes("群发成功")) return "success";
        if (t.includes("失败")) return "failed";
        return "pending";
      });
      if (result === "success") { success = true; break; }
      if (result === "failed") break;
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-publish-result.png` });
    console.log(success ? "PUBLISH SUCCESS!" : "PUBLISH RESULT UNKNOWN");

    fs.writeFileSync(`${SCREENSHOT_DIR}/wechat-publish-result.json`, JSON.stringify({
      success, type: "article", title: POST.title, timestamp: new Date().toISOString(),
    }, null, 2));

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

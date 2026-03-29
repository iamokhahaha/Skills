/**
 * 微信公众号视频发布脚本（type=15, 保存草稿→群发）
 *
 * 用法: 修改 POST 对象后运行
 *   cd ~/.claude/skills/auto-dev-browser
 *   PATH="./node_modules/.bin:$PATH" tsx ~/.claude/skills/media-wechat-publish/scripts/publish-video.ts
 *
 * 前提: dev-browser server 已启动，公众号已登录
 */
import { connect, waitForPageLoad } from "@/client.js";
import * as fs from "fs";

const SCREENSHOT_DIR = "/Users/ayuu/Desktop/zero-code/tmp";

const POST = {
  // ── 素材 ──
  video: "",               // 视频文件路径（≤ 200MB）
  // ── 内容 ──
  title: "",               // 标题（≤ 64 字）
};

async function main() {
  if (!POST.video || !fs.existsSync(POST.video)) { console.log("ERROR: 视频文件不存在"); process.exit(1); }
  if (!POST.title) { console.log("ERROR: 标题不能为空"); process.exit(1); }

  const client = await connect();
  const page = await client.page("wechat-publish");
  await page.setViewportSize({ width: 1280, height: 800 });
  page.on("dialog", async (d) => { await d.accept(); });

  try {
    // ── Step 1: 登录 & Token ──
    console.log("Step 1: 检查登录...");
    await page.goto("https://mp.weixin.qq.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
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

    // ── Step 2: 打开视频编辑器 ──
    console.log("Step 2: 打开视频编辑器...");
    await page.goto(
      `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=15&token=${token}`,
      { waitUntil: "domcontentloaded", timeout: 30000 },
    );
    await page.waitForTimeout(3000);

    // 关闭弹幕提示
    for (const t of ["知道了", "我知道了"]) {
      try {
        const btn = page.getByText(t, { exact: true });
        if (await btn.isVisible({ timeout: 2000 })) await btn.click();
      } catch {}
    }

    // ── Step 3: 上传视频 ──
    console.log("Step 3: 上传视频...");
    const fileInput = await page.$('input[type="file"][accept*="video"]') || await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles(POST.video);
    } else {
      console.log("ERROR: 未找到视频上传输入框");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-no-video-input.png` });
      return;
    }

    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(2000);
      const done = await page.evaluate(() =>
        document.body.innerText.includes("上传成功") || document.body.innerText.includes("重新上传")
      );
      if (done) break;
      if (i % 5 === 4) console.log(`  视频处理中... (${(i + 1) * 2}s)`);
    }
    console.log("  视频上传完成");

    // ── Step 4: 填标题 ──
    console.log("Step 4: 填写标题...");
    const titleInputs = await page.$$('input[type="text"].weui-desktop-form__input');
    for (const input of titleInputs) {
      const ph = await input.getAttribute("placeholder") || "";
      if (!ph.includes("关键词") && await input.isVisible()) {
        await input.fill(POST.title.slice(0, 64));
        console.log("  标题:", POST.title.slice(0, 64));
        break;
      }
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-video-before-save.png` });

    // ── Step 5: 保存草稿 ──
    console.log("Step 5: 保存草稿...");
    try {
      await page.getByText("保存", { exact: true }).click();
    } catch {
      await page.evaluate(() => {
        for (const btn of document.querySelectorAll("button, a")) {
          if (btn.textContent?.trim() === "保存") { (btn as HTMLElement).click(); return; }
        }
      });
    }
    await page.waitForTimeout(3000);

    const saved = await page.evaluate(() => {
      const t = document.body.innerText;
      return t.includes("保存成功") || t.includes("已保存");
    });
    console.log(saved ? "  草稿已保存" : "  WARNING: 保存结果未确认");

    // ── Step 6: 导航到草稿箱 → 群发 ──
    console.log("Step 6: 打开草稿箱...");
    await page.goto(
      `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_list&action=list_card&type=10&token=${token}`,
      { waitUntil: "domcontentloaded", timeout: 30000 },
    );
    await waitForPageLoad(page);
    await page.waitForTimeout(3000);

    // 找第一条草稿，hover 显示操作按钮
    const firstCard = await page.$(".weui-desktop-card, .card_appmsg_normal, [class*='appmsg_item']");
    if (firstCard) {
      await firstCard.hover();
      await page.waitForTimeout(1000);

      // 点击群发
      let massSendClicked = false;
      try {
        await page.getByText("群发", { exact: true }).first().click();
        massSendClicked = true;
      } catch {
        const clicked = await page.evaluate(() => {
          for (const el of document.querySelectorAll("a, button, span")) {
            if (el.textContent?.trim() === "群发") { (el as HTMLElement).click(); return true; }
          }
          return false;
        });
        massSendClicked = !!clicked;
      }

      if (massSendClicked) {
        console.log("  已点击群发");
        await page.waitForTimeout(2000);

        // 确认群发
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
        console.log(result === "success" ? "PUBLISH SUCCESS!" : `群发结果: ${result}`);

        fs.writeFileSync(`${SCREENSHOT_DIR}/wechat-publish-result.json`, JSON.stringify({
          success: result === "success", type: "video", title: POST.title, timestamp: new Date().toISOString(),
        }, null, 2));
      } else {
        console.log("  WARNING: 未找到群发按钮");
      }
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-publish-result.png` });

  } finally {
    await client.disconnect();
  }
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  fs.writeFileSync(`${SCREENSHOT_DIR}/wechat-publish-result.json`, JSON.stringify({
    success: false, type: "video", error: e.message, timestamp: new Date().toISOString(),
  }, null, 2));
  process.exit(1);
});

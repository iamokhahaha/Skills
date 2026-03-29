/**
 * 微信视频号发布脚本（channels.weixin.qq.com，wujie 微前端）
 *
 * 用法: 先生成 JSON 数据文件，然后运行脚本
 *   npx tsx publish-videohao.ts <json-path>
 *
 * JSON 格式:
 *   { video, description, shortTitle? }
 *
 * 前提: infra-browser server 已启动，视频号已登录
 * 大文件(>50MB): 使用 setFileServerSide 绕过 CDP 限制
 */
import { connect, waitForPageLoad, setFileServerSide } from "@/client.js";
import * as fs from "fs";

const SCREENSHOT_DIR = "/Users/ayuu/Desktop/zero-code/tmp";

// ── 从 JSON 文件读取发布数据 ──
const jsonPath = process.argv[2];
if (!jsonPath || !fs.existsSync(jsonPath)) {
  console.error("用法: npx tsx publish-videohao.ts <json-path>");
  console.error("  JSON 必须包含: video, description");
  process.exit(1);
}
const POST = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as {
  video: string;
  description: string;
  shortTitle?: string;
};
POST.shortTitle = POST.shortTitle ?? "";

async function main() {
  if (!POST.video || !fs.existsSync(POST.video)) { console.log("ERROR: 视频文件不存在"); process.exit(1); }

  const fileSizeMB = fs.statSync(POST.video).size / 1024 / 1024;
  console.log(`视频: ${POST.video} (${fileSizeMB.toFixed(1)}MB)`);

  const client = await connect();
  const page = await client.page("wechat-channels");
  await page.setViewportSize({ width: 1280, height: 800 });
  page.on("dialog", async (d) => { await d.accept(); });

  try {
    // ── Step 1: 导航 & 检查登录 ──
    console.log("Step 1: 检查登录...");
    await page.goto("https://channels.weixin.qq.com/platform/post/create", {
      waitUntil: "domcontentloaded", timeout: 30000,
    });
    await waitForPageLoad(page);
    await page.waitForTimeout(3000);

    const needsLogin = await page.evaluate(() =>
      !!document.querySelector('[class*="login"], [class*="qrcode"]') || document.body.innerText.includes("扫码登录")
    );
    if (needsLogin) {
      console.log("NEEDS_LOGIN: 请用微信扫码登录视频号后台");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-channels-login.png` });
      for (let i = 0; i < 300; i++) {
        await page.waitForTimeout(1000);
        const loggedIn = await page.evaluate(() =>
          !document.querySelector('[class*="qrcode"]') && !document.body.innerText.includes("扫码登录")
        );
        if (loggedIn) break;
      }
    }
    console.log("  已登录");

    // ── Step 2: 等待 wujie iframe 加载 ──
    console.log("Step 2: 等待 wujie iframe...");
    let wujieFrame: any = null;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(1000);
      wujieFrame = page.frames().find((f: any) => f.url().includes("micro/content/post/create"));
      if (wujieFrame) {
        const hasInput = await wujieFrame.evaluate(() => !!document.querySelector('input[type="file"]'));
        if (hasInput) break;
      }
      if (i % 10 === 9) console.log(`  等待中... (${i + 1}s)`);
    }
    if (!wujieFrame) {
      console.log("ERROR: wujie iframe 加载超时");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-channels-no-wujie.png` });
      return;
    }
    console.log("  wujie iframe 已加载");

    // ── Step 3: 上传视频 ──
    console.log("Step 3: 上传视频...");
    if (fileSizeMB > 50) {
      console.log("  大文件模式 (server-side)...");
      const result = await setFileServerSide("wechat-channels", POST.video, {
        selector: 'input[type="file"]',
        frameUrl: "micro/content/post/create",
      });
      console.log("  上传方式:", result.method);
    } else {
      const fileInput = await wujieFrame.$('input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(POST.video);
      } else {
        console.log("ERROR: 未找到视频上传输入框");
        return;
      }
    }

    // 等待视频上传完成（大文件可能需要数分钟）
    // 注意：hasVideo/hasPreview 出现后视频可能仍在上传中（显示百分比），
    // 必须等到发表按钮的 disabled class 消失才算真正完成
    for (let i = 0; i < 180; i++) {
      await page.waitForTimeout(5000);
      const status = await wujieFrame.evaluate(() => {
        const hasVideo = !!document.querySelector("video");
        const publishBtn = Array.from(document.querySelectorAll("button")).find(b => b.textContent?.trim() === "发表");
        const btnDisabled = publishBtn?.className.includes("disabled") ?? true;
        const text = document.body.innerText;
        const match = text.match(/(\d+)%/);
        const pct = match ? match[1] : null;
        return { hasVideo, btnDisabled, pct };
      });
      if (status.hasVideo && !status.btnDisabled) { console.log("  视频上传完成，发表按钮已激活"); break; }
      if (i % 6 === 0) {
        const pctStr = status.pct ? `${status.pct}%` : "处理中";
        console.log(`  视频上传中... (${(i + 1) * 5}s, ${pctStr})`);
      }
      if (i % 12 === 11) {
        await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-channels-upload-${i}.png` });
      }
    }

    // ── Step 4: 填写描述 ──
    if (POST.description) {
      console.log("Step 4: 填写描述...");
      await wujieFrame.evaluate((text: string) => {
        const editor = document.querySelector(".input-editor") as HTMLElement;
        if (!editor) throw new Error(".input-editor not found");
        editor.focus();
        editor.textContent = text;
        editor.dispatchEvent(new Event("input", { bubbles: true }));
      }, POST.description);
      console.log("  描述已填写");
    }

    // ── Step 5: 填写短标题 ──
    if (POST.shortTitle) {
      console.log("Step 5: 填写短标题...");
      await wujieFrame.evaluate((title: string) => {
        const inputs = document.querySelectorAll("input.weui-desktop-form__input");
        for (const input of inputs) {
          const ph = (input as HTMLInputElement).placeholder || "";
          if (ph.includes("概括视频主要内容")) {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
            setter.call(input, title);
            input.dispatchEvent(new Event("input", { bubbles: true }));
            break;
          }
        }
      }, POST.shortTitle);
      console.log("  短标题:", POST.shortTitle);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-channels-before-publish.png` });

    // ── Step 6: 发表 ──
    console.log("Step 6: 点击发表...");
    // 发表按钮在 wujie iframe 内（不是外层 page）
    // 必须确认按钮不含 disabled class 才能点击
    let publishClicked = false;

    // 优先: wujie iframe 内点击（按钮实际位置）
    try {
      const clicked = await wujieFrame.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b => b.textContent?.trim() === "发表");
        if (btn && !btn.className.includes("disabled")) { btn.click(); return true; }
        return false;
      });
      publishClicked = !!clicked;
      if (clicked) console.log("  已点击（wujie iframe）");
    } catch {}

    // 降级: 外层 page 上点击
    if (!publishClicked) {
      try {
        const allBtns = await page.$$("button");
        for (const btn of allBtns) {
          const text = await btn.textContent();
          if (text?.trim() === "发表") {
            await btn.click({ force: true });
            publishClicked = true;
            console.log("  已点击（外层 page）");
            break;
          }
        }
      } catch {}
    }

    if (!publishClicked) {
      console.log("  WARNING: 未找到发表按钮或按钮仍为 disabled");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-channels-no-publish.png` });
    }

    // 等待结果
    let success = false;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(2000);
      const url = page.url();
      if (url.includes("/platform/post/list") || url.includes("isFromCreate")) {
        success = true; break;
      }
      const result = await page.evaluate(() => {
        const t = document.body.innerText;
        if (t.includes("发表成功") || t.includes("已发表")) return "success";
        if (t.includes("失败")) return "failed";
        return "pending";
      });
      if (result === "success") { success = true; break; }
      if (result === "failed") break;
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/wechat-channels-result.png` });
    console.log(success ? "PUBLISH SUCCESS!" : "PUBLISH RESULT UNKNOWN");

    fs.writeFileSync(`${SCREENSHOT_DIR}/wechat-publish-result.json`, JSON.stringify({
      success, type: "channels", description: POST.description?.slice(0, 50), timestamp: new Date().toISOString(),
    }, null, 2));

  } finally {
    await client.disconnect();
  }
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  fs.writeFileSync(`${SCREENSHOT_DIR}/wechat-publish-result.json`, JSON.stringify({
    success: false, type: "channels", error: e.message, timestamp: new Date().toISOString(),
  }, null, 2));
  process.exit(1);
});

/**
 * 小宇宙播客单集发布脚本
 *
 * 用法: 修改 POST 对象后运行
 *   cd ~/.claude/skills/auto-dev-browser
 *   PATH="./node_modules/.bin:$PATH" tsx ~/.claude/skills/media-xiaoyuzhou-publish/scripts/publish-episode.ts
 *
 * 前提: dev-browser server 已启动，小宇宙创作者后台已登录
 * 注意: 小宇宙无草稿功能，"创建"即发布
 */
import { connect, waitForPageLoad } from "@/client.js";
import * as fs from "fs";

const SCREENSHOT_DIR = "/Users/ayuu/Desktop/zero-code/tmp";

const POST = {
  // ── 素材 ──
  audio: "",                // 音频文件路径（MP3/M4A, ≤200MB）
  cover: "",                // 封面图路径（可选，不传用节目默认封面）

  // ── 内容 ──
  title: "",                // 单集标题
  showNotes: "",            // 简介（支持时间戳章节: "00:00 开场白\n02:30 主题一"）

  // ── 节目信息 ──
  podcastId: "65ed805f8e6f71a5b71b561d", // 节目 ID（默认"玛莎"）
};

async function main() {
  if (!POST.audio || !fs.existsSync(POST.audio)) { console.log("ERROR: 音频文件不存在"); process.exit(1); }
  if (!POST.title) { console.log("ERROR: 标题不能为空"); process.exit(1); }

  const client = await connect();
  const page = await client.page("xiaoyuzhou-publish");
  await page.setViewportSize({ width: 1280, height: 800 });

  try {
    // ── Step 1: 导航到创建单集页 ──
    console.log("Step 1: 导航到创建单集页...");
    await page.goto(`https://podcaster.xiaoyuzhoufm.com/podcasts/${POST.podcastId}/create/episode`, {
      waitUntil: "domcontentloaded", timeout: 30000,
    });
    await waitForPageLoad(page);
    await page.waitForTimeout(3000);

    // 检查登录
    if (page.url().includes("/login") || page.url().includes("/passport")) {
      console.log("NEEDS_LOGIN: 请在浏览器中登录小宇宙创作者后台");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/xiaoyuzhou-login.png` });
      for (let i = 0; i < 300; i++) {
        await page.waitForTimeout(1000);
        if (!page.url().includes("/login") && !page.url().includes("/passport")) break;
      }
      if (page.url().includes("/login")) { console.log("登录超时"); return; }
      await page.goto(`https://podcaster.xiaoyuzhoufm.com/podcasts/${POST.podcastId}/create/episode`, {
        waitUntil: "domcontentloaded", timeout: 30000,
      });
      await page.waitForTimeout(3000);
    }
    console.log("  已进入创建页:", page.url());

    // ── Step 2: 上传音频 ──
    console.log("Step 2: 上传音频...");
    let fileInput = await page.$('input[type="file"][accept="audio/*"]')
      || await page.$('input[type="file"][accept*=".mp3"]')
      || await page.$('input#upload')
      || await page.$('input[type="file"]');

    if (fileInput) {
      await fileInput.setInputFiles(POST.audio);
      console.log("  音频文件已设置");
    } else {
      // 降级: 通过点击上传区域触发
      try {
        const [fileChooser] = await Promise.all([
          page.waitForEvent("filechooser", { timeout: 15000 }),
          page.evaluate(() => {
            const el = document.querySelector('[class*="upload"], [class*="drag"]');
            if (el) (el as HTMLElement).click();
          }),
        ]);
        await fileChooser.setFiles(POST.audio);
        console.log("  音频文件已设置 (filechooser)");
      } catch {
        console.log("ERROR: 未找到音频上传入口");
        await page.screenshot({ path: `${SCREENSHOT_DIR}/xiaoyuzhou-no-upload.png` });
        return;
      }
    }

    // 等待上传完成
    let uploaded = false;
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(2000);
      const status = await page.evaluate(() => {
        const t = document.body.innerText;
        if (t.includes("上传完成") || t.includes("上传成功")) return "done";
        const titleInput = document.querySelector('input[placeholder*="标题"]');
        if (titleInput) return "done";
        if (t.includes("上传失败") || t.includes("格式错误")) return "failed";
        return "waiting";
      });
      if (status === "done") { uploaded = true; break; }
      if (status === "failed") { console.log("  音频上传失败"); break; }
      if (i % 15 === 14) console.log(`  音频处理中... (${(i + 1) * 2}s)`);
    }
    if (!uploaded) { console.log("  WARNING: 上传状态未确认"); }
    console.log("  音频上传完成");

    // ── Step 3: 填写标题 ──
    console.log("Step 3: 填写标题...");
    const titleInput = await page.$('input[placeholder*="标题"]')
      || await page.$('[class*="title"] input');
    if (titleInput) {
      await titleInput.click();
      await page.waitForTimeout(300);
      await titleInput.fill(POST.title);
      console.log("  标题:", POST.title);
    } else {
      console.log("  WARNING: 未找到标题输入框");
    }

    // ── Step 4: 填写 Show Notes ──
    if (POST.showNotes) {
      console.log("Step 4: 填写简介...");
      const editor = await page.$(".ProseMirror")
        || await page.$('[contenteditable="true"]');
      if (editor) {
        await editor.click();
        await page.waitForTimeout(300);
        // 用 clipboard paste 保持时间戳格式
        await page.evaluate((text: string) => {
          const el = document.querySelector(".ProseMirror") || document.querySelector('[contenteditable="true"]');
          if (!el) return;
          const html = text.split("\n").map((l) => `<p>${l || "<br>"}</p>`).join("");
          const dt = new DataTransfer();
          dt.setData("text/html", html);
          dt.setData("text/plain", text);
          el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
        }, POST.showNotes);
        console.log("  简介已填写");
      } else {
        console.log("  WARNING: 未找到简介编辑器");
      }
    }

    // ── Step 5: 上传封面（可选） ──
    if (POST.cover && fs.existsSync(POST.cover)) {
      console.log("Step 5: 上传封面...");
      try {
        const [fileChooser] = await Promise.all([
          page.waitForEvent("filechooser", { timeout: 10000 }),
          page.evaluate(() => {
            for (const el of document.querySelectorAll("div, span, button, label")) {
              if (el.textContent?.includes("点击上传封面") || el.textContent?.includes("上传封面")) {
                (el as HTMLElement).click();
                return;
              }
            }
          }),
        ]);
        await fileChooser.setFiles(POST.cover);
        await page.waitForTimeout(3000);

        // 确认裁剪
        try {
          await page.getByText("裁剪", { exact: true }).click();
          await page.waitForTimeout(1000);
        } catch {}
        console.log("  封面已设置");
      } catch {
        console.log("  WARNING: 封面上传失败");
      }
    }

    // ── Step 6: 勾选协议 ──
    console.log("Step 6: 检查协议...");
    try {
      const checkbox = await page.$('input[type="checkbox"]');
      if (checkbox) {
        const checked = await checkbox.isChecked();
        if (!checked) {
          await checkbox.click();
          console.log("  协议已勾选");
        }
      }
    } catch {}

    await page.screenshot({ path: `${SCREENSHOT_DIR}/xiaoyuzhou-before-publish.png` });

    // ── Step 7: 点击"创建"发布 ──
    console.log("Step 7: 点击创建（发布）...");
    let publishClicked = false;
    try {
      await page.getByText("创建", { exact: true }).click();
      publishClicked = true;
    } catch {
      const clicked = await page.evaluate(() => {
        for (const btn of document.querySelectorAll("button")) {
          if (btn.textContent?.trim() === "创建") { btn.click(); return true; }
        }
        return false;
      });
      publishClicked = !!clicked;
    }

    if (!publishClicked) {
      console.log("  WARNING: 未找到创建按钮");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/xiaoyuzhou-no-create-btn.png` });
    }

    // 等待结果（创建成功后跳转到 /contents-management/episodes）
    let success = false;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(2000);
      if (page.url().includes("contents-management") || page.url().includes("isFromCreate")) {
        success = true; break;
      }
      const result = await page.evaluate(() => {
        const t = document.body.innerText;
        if (t.includes("发布成功") || t.includes("已发布") || t.includes("创建成功")) return "success";
        if (t.includes("需完成主体认证")) return "need-verify";
        if (t.includes("失败")) return "failed";
        return "pending";
      });
      if (result === "success") { success = true; break; }
      if (result === "need-verify") {
        console.log("  ERROR: 需要完成实名认证才能发布");
        break;
      }
      if (result === "failed") break;
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/xiaoyuzhou-result.png` });
    console.log(success ? "PUBLISH SUCCESS!" : "PUBLISH RESULT UNKNOWN");

    fs.writeFileSync(`${SCREENSHOT_DIR}/xiaoyuzhou-publish-result.json`, JSON.stringify({
      success, title: POST.title, podcastId: POST.podcastId, timestamp: new Date().toISOString(),
    }, null, 2));

  } finally {
    await client.disconnect();
  }
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  fs.writeFileSync(`${SCREENSHOT_DIR}/xiaoyuzhou-publish-result.json`, JSON.stringify({
    success: false, error: e.message, timestamp: new Date().toISOString(),
  }, null, 2));
  process.exit(1);
});

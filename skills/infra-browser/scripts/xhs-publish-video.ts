import { connect, waitForPageLoad } from "@/client.js";

const VIDEO_PATH = "/Users/ayuu/Desktop/zero-code/tmp/code-zero-xhs.mp4";
const TITLE = "AI取代老师后，她在教什么";
const BODY = `2056年，上海浦东，星澜小学。

三十二个教学岗位里，只有两个是真人——陈韵和体育老师赵磊。其余全是AI教学系统。

陈韵教的是"人际实践课"。没有屏幕，没有投影，没有耳机。就十三个人坐在圆圈里。

一个八岁男孩问她："老师，你会记住我说的所有话吗？"
"不会。"
"AI也能看到我的表情啊。"
"它看到了。但它不会因为你的表情而改变心情。"

这些孩子从幼儿园开始就在AI教学系统里上课。他们习惯了面对屏幕，习惯了一个永远温和地注视着他们的虚拟面孔。

现在他们要学一件AI教不了的事：拥抱一个真人。

一个女孩抱完同学后回家说："她身上有一股洗衣液的味道，是真的味道，不是模拟的。"

味道。温度。一张皱巴巴的纸巾。一块干掉的橘子皮。一个画歪了的笑脸。

一个真人在你面前，和一个完美的模拟在你面前，差别也许只有被拥抱的人知道。`;
const TAGS = ["AI教育", "未来教育", "2056", "代码归零", "科幻叙事", "人工智能"];

async function main() {
  const client = await connect();
  const page = await client.page("xhs-publish");
  await page.setViewportSize({ width: 1280, height: 800 });

  // Step 1: Navigate to XHS publish page
  console.log("=== Step 1: 导航到小红书发布页 ===");
  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await waitForPageLoad(page);

  const needsLogin = page.url().includes("/login");
  console.log({ needsLogin, url: page.url() });

  if (needsLogin) {
    console.log("❌ 请在浏览器中扫码登录小红书");
    await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-login.png" });
    // Wait for login (up to 5 minutes)
    for (let i = 0; i < 300; i++) {
      await page.waitForTimeout(1000);
      if (!page.url().includes("/login")) {
        console.log("✅ 登录成功!");
        // Re-navigate to publish page after login
        await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await waitForPageLoad(page);
        break;
      }
      if (i % 30 === 29) console.log(`等待登录... (${i + 1}s)`);
    }
    if (page.url().includes("/login")) {
      console.log("❌ 登录超时");
      await client.disconnect();
      return;
    }
  }

  console.log("✅ 已登录，准备上传视频");
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-publish-page.png" });

  // Step 2: Upload video
  console.log("=== Step 2: 上传视频 ===");
  let fileInput = await page.$('input[type="file"]');
  if (!fileInput) {
    fileInput = await page.$('input[accept*="video"]');
  }
  if (fileInput) {
    await fileInput.setInputFiles(VIDEO_PATH);
    console.log("视频已选择，等待上传...");
  } else {
    console.log("❌ 未找到 file input，截图检查");
    await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-no-input.png" });
    await client.disconnect();
    return;
  }

  // Wait for video processing
  let processed = false;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(3000);
    const progress = await page.evaluate(() => {
      const processing = document.querySelector('[class*="progress"], [class*="uploading"], [class*="processing"]');
      const done = document.querySelector('[class*="uploaded"], [class*="success"], .publish-video-info');
      const text = document.body.innerText;
      return {
        processing: !!processing,
        done: !!done || text.includes("重新上传") || text.includes("上传成功"),
      };
    });
    if (progress.done && !progress.processing) {
      processed = true;
      console.log("✅ 视频处理完成");
      break;
    }
    if (i % 5 === 4) console.log(`视频处理中... (${(i + 1) * 3}s)`);
  }

  if (!processed) {
    console.log("⚠️ 视频处理超时，继续尝试填写信息");
  }

  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-video-uploaded.png" });

  // Step 3: Fill title
  console.log("=== Step 3: 填写标题 ===");
  const titleInput = await page.$('input[placeholder*="标题"], div.d-input input, input.c-input_inner');
  if (titleInput) {
    await titleInput.click();
    await page.waitForTimeout(300);
    await titleInput.fill(TITLE.slice(0, 20));
    console.log(`标题已填写: ${TITLE.slice(0, 20)}`);
  } else {
    console.log("⚠️ 未找到标题输入框");
  }

  // Step 4: Fill body text
  console.log("=== Step 4: 填写正文 ===");
  const bodyEditor = await page.$('div.tiptap.ProseMirror')
    || await page.$('div[contenteditable="true"][role="textbox"]')
    || await page.$('[contenteditable="true"]');
  if (bodyEditor) {
    await bodyEditor.click();
    await page.waitForTimeout(300);
    const lines = BODY.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) await page.keyboard.type(lines[i], { delay: 5 });
      if (i < lines.length - 1) await page.keyboard.press("Enter");
    }
    console.log("✅ 正文已填写");
  } else {
    console.log("⚠️ 未找到正文编辑器");
  }

  // Step 5: Add tags
  console.log("=== Step 5: 添加标签 ===");
  if (bodyEditor) {
    await bodyEditor.click();
    await page.keyboard.down("Meta");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.up("Meta");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    for (const tag of TAGS.slice(0, 8)) {
      await page.keyboard.type("#", { delay: 0 });
      await page.waitForTimeout(200);
      await page.keyboard.type(tag, { delay: 30 });
      await page.waitForTimeout(1500);

      const hasSuggestion = await page.$('#creator-editor-topic-container');
      if (hasSuggestion) {
        await page.keyboard.press("Enter");
        await page.waitForTimeout(800);
      } else {
        await page.keyboard.type(" ", { delay: 0 });
        await page.waitForTimeout(300);
      }
    }
    await page.keyboard.press("Escape");
    console.log("✅ 标签已添加");
  }

  // Step 6: AI declaration checkbox
  console.log("=== Step 6: AI声明 ===");
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(1000);

  const aiChecked = await page.evaluate(() => {
    const allEls = document.querySelectorAll('label, span, div, p');
    for (const el of allEls) {
      const text = el.textContent?.trim() || '';
      if (text.includes('AI') && (text.includes('生成') || text.includes('创作') || text.includes('声明'))) {
        const parent = el.closest('div, label, section');
        if (!parent) continue;
        const toggle = parent.querySelector(
          'input[type="checkbox"], [class*="switch"], [class*="toggle"], [class*="check"], [role="switch"], [role="checkbox"]'
        );
        if (toggle) {
          (toggle as HTMLElement).click();
          return `clicked: ${text}`;
        }
        (el as HTMLElement).click();
        return `clicked-text: ${text}`;
      }
    }
    return null;
  });
  console.log({ aiChecked });

  // Step 7: Save as draft
  console.log("=== Step 7: 存草稿 ===");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-video-filled.png" });

  const drafted = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("div.submit button, button.btn, button"));
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || "";
      if (text.includes("暂存") || text.includes("草稿")) {
        (btn as HTMLButtonElement).click();
        return text;
      }
    }
    return null;
  });
  console.log(drafted ? `✅ 草稿已保存: ${drafted}` : "⚠️ 未找到草稿按钮");

  await page.waitForTimeout(3000);
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-video-result.png" });
  await client.disconnect();
}

main().catch(console.error);

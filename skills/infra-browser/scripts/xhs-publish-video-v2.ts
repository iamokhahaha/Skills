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

  console.log("Current URL:", page.url());

  // Navigate to publish page
  if (!page.url().includes("publish/publish")) {
    await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await waitForPageLoad(page);
  }

  // KEY FIX: Wait for upload area to render
  console.log("=== 等待上传区域渲染 ===");
  try {
    await page.waitForSelector('.upload-input', { timeout: 15000, state: 'attached' });
    console.log("✅ 上传区域已加载");
  } catch {
    console.log("⚠️ 上传区域未出现，等待更久...");
    await page.waitForTimeout(5000);
  }

  // Step 1: Upload video using correct selector
  console.log("=== Step 1: 上传视频 ===");
  const fileInput = await page.$('input.upload-input');
  if (fileInput) {
    await fileInput.setInputFiles(VIDEO_PATH);
    console.log("✅ 视频已选择 (34MB)，等待上传处理...");
  } else {
    // Fallback
    const anyInput = await page.$('input[type="file"]');
    if (anyInput) {
      await anyInput.setInputFiles(VIDEO_PATH);
      console.log("✅ 视频已选择 (fallback selector)");
    } else {
      console.log("❌ 仍未找到上传输入");
      await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-v2-noinput.png" });
      await client.disconnect();
      return;
    }
  }

  // Wait for video processing
  let processed = false;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(3000);
    const status = await page.evaluate(() => {
      const text = document.body.innerText;
      const hasProgress = !!document.querySelector('[class*="progress"]');
      const hasVideoInfo = !!document.querySelector('.publish-video-info, [class*="video-info"]');
      const hasReupload = text.includes("重新上传");
      const hasTitleInput = !!document.querySelector('input[placeholder*="标题"], div.d-input input');
      return { hasProgress, hasVideoInfo, hasReupload, hasTitleInput };
    });

    if ((status.hasVideoInfo || status.hasReupload || status.hasTitleInput) && !status.hasProgress) {
      processed = true;
      console.log("✅ 视频处理完成");
      break;
    }
    if (i % 5 === 4) console.log(`视频处理中... (${(i + 1) * 3}s) ${JSON.stringify(status)}`);
  }

  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-video-uploaded-v2.png" });

  if (!processed) {
    console.log("⚠️ 视频处理超时，继续尝试");
  }

  // Step 2: Fill title
  console.log("=== Step 2: 填写标题 ===");
  await page.waitForTimeout(2000);

  // Try multiple selectors for title
  let titleFilled = false;
  for (const sel of ['input[placeholder*="标题"]', 'div.d-input input', 'input.c-input_inner']) {
    const titleInput = await page.$(sel);
    if (titleInput && await titleInput.isVisible()) {
      await titleInput.click();
      await page.waitForTimeout(300);
      await titleInput.fill(TITLE.slice(0, 20));
      console.log(`✅ 标题已填写: "${TITLE.slice(0, 20)}" (selector: ${sel})`);
      titleFilled = true;
      break;
    }
  }
  if (!titleFilled) {
    console.log("⚠️ 未找到标题输入框");
    // Dump all inputs for debugging
    const inputs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).map(inp => ({
        type: inp.type, placeholder: inp.placeholder, class: inp.className, visible: inp.offsetParent !== null,
      }))
    );
    console.log("All inputs:", JSON.stringify(inputs, null, 2));
  }

  // Step 3: Fill body text
  console.log("=== Step 3: 填写正文 ===");
  let bodyEditor = await page.$('div.tiptap.ProseMirror');
  if (!bodyEditor) bodyEditor = await page.$('div[contenteditable="true"][role="textbox"]');
  if (!bodyEditor) bodyEditor = await page.$('[contenteditable="true"]');

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

  // Step 4: Add tags
  console.log("=== Step 4: 添加标签 ===");
  if (bodyEditor) {
    await bodyEditor.click();
    await page.keyboard.down("Meta");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.up("Meta");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    for (const tag of TAGS.slice(0, 6)) {
      await page.keyboard.type("#", { delay: 0 });
      await page.waitForTimeout(300);
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

  // Step 5: AI declaration
  console.log("=== Step 5: AI声明 ===");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);

  const aiChecked = await page.evaluate(() => {
    const allEls = document.querySelectorAll('label, span, div, p');
    for (const el of allEls) {
      const text = el.textContent?.trim() || '';
      if (text.includes('AI') && (text.includes('生成') || text.includes('创作') || text.includes('声明'))) {
        const parent = el.closest('div, label, section');
        if (!parent) continue;
        const toggle = parent.querySelector(
          'input[type="checkbox"], [class*="switch"], [class*="toggle"], [role="switch"]'
        );
        if (toggle) {
          (toggle as HTMLElement).click();
          return `clicked: ${text}`;
        }
      }
    }
    return null;
  });
  console.log({ aiChecked });

  // Step 6: Save as draft
  console.log("=== Step 6: 存草稿 ===");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-video-filled-v2.png" });

  const drafted = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || "";
      if (text.includes("暂存") || text.includes("草稿") || text === "存草稿") {
        (btn as HTMLButtonElement).click();
        return text;
      }
    }
    return null;
  });

  if (drafted) {
    console.log(`✅ 草稿已保存: ${drafted}`);
  } else {
    console.log("⚠️ 未找到草稿按钮，尝试其他选择器");
    // Try finding by role or other attributes
    const buttons = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button")).map(b => b.textContent?.trim())
    );
    console.log("Available buttons:", buttons);
  }

  await page.waitForTimeout(3000);
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-video-result-v2.png" });
  console.log("=== 完成 ===");
  await client.disconnect();
}

main().catch(console.error);

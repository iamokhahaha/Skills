import { connect, waitForPageLoad } from "@/client.js";

const TITLE = "最后的真人老师：2056，她教孩子们拥抱";
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

一个真人在你面前，和一个完美的模拟在你面前，差别也许只有被拥抱的人知道。

陈韵每周三下午都要给学生做一个叫"情绪审计"的练习：十三个人坐在圆圈里，每人说一个这周让自己不舒服的事，其他人不说话，只听。

有个男孩说："我妈让我把AI家教的反馈读给她听，但她不看我的脸。"

另一个说："我画了一幅画，AI系统说'很好'，但我不知道它为什么说很好。"

"你怎么想的？"陈韵问。

"我觉得它不是在看我的画。它在看所有人的画。"

孩子们越来越熟练地使用AI系统，也越来越不会看人。他们能在0.3秒内找到知识库中的答案，却不知道坐在他们旁边的同学在发抖。

陈韵做了一件没有被列入教学大纲的事：她让每个人闭上眼睛，拉着旁边的人的手，不说话，两分钟。

一个女孩事后说："我第一次知道，有人的手是凉的。"

校长跟陈韵说：这门课还要上多久？教育局的标准里没有"人际实践"这个类目。

"你的课没有考试成绩。也没有标准化测评分数。你怎么证明你教了东西？"

"我不需要证明。"

"那你怎么保住这门课？"

"让它不像一门课。"

后来她把"人际实践课"改名叫"故事时间"。她每周讲一个真人做过的真实的事，没有教案，没有ppt，也不布置作业。

孩子们听完会安静一会儿。有人会问一个问题。有人会什么都不说。

有个女孩听完一个关于独居老人和一只猫的故事后说："老师，她不孤独了吗？"

"我不知道。"

"那她养猫有用吗？"

"也许有用。也许养猫不是为了解决孤独。"

"那为什么养？"

"也许是因为想摸一个活的东西。"

女孩想了很久。后来她画了一幅画，画上是一只趴在窗边的猫，眼睛很大。她在画的角落写了一行字：

"它不需要回答我。但它在。"

#AI教育 #未来教育 #2056 #代码归零 #科幻叙事 #人工智能`;

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

  // Switch to long article tab
  await page.waitForSelector('.creator-tab', { timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('.creator-tab');
    for (const tab of tabs) {
      if ((tab as HTMLElement).textContent?.trim().includes('长文')) {
        (tab as HTMLElement).click();
        break;
      }
    }
  });
  await page.waitForTimeout(2000);

  // Click "新的创作" button
  console.log("=== Step 1: 新建长文 ===");
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent?.trim().includes('新的创作')) {
        btn.click();
        break;
      }
    }
  });
  await page.waitForTimeout(3000);

  // Fill title
  console.log("=== Step 2: 填写标题 ===");
  const titleArea = await page.$('textarea[placeholder="输入标题"], textarea.d-text');
  if (titleArea) {
    await titleArea.click();
    await page.waitForTimeout(300);
    await titleArea.fill(TITLE);
    console.log(`Title filled: "${TITLE}" (${TITLE.length}/64 chars)`);
  } else {
    console.log("Title textarea not found");
  }

  // Fill body
  console.log("=== Step 3: 填写正文 ===");
  const bodyEditor = await page.$('div.tiptap.ProseMirror');
  if (bodyEditor) {
    await bodyEditor.click();
    await page.waitForTimeout(300);
    const lines = BODY.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) await page.keyboard.type(lines[i], { delay: 3 });
      if (i < lines.length - 1) await page.keyboard.press("Enter");
    }
    console.log(`Body filled (${BODY.length} chars)`);
  } else {
    console.log("Body editor not found");
  }

  await page.waitForTimeout(1000);
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-longarticle-content.png" });

  // Click "一键排版" to see style options
  console.log("=== Step 4: 点击一键排版 ===");
  const formatBtn = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent?.trim().includes('一键排版')) {
        btn.click();
        return btn.textContent?.trim();
      }
    }
    return null;
  });
  console.log("Clicked:", formatBtn);
  await page.waitForTimeout(3000);
  console.log("URL after format click:", page.url());

  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-longarticle-styles.png" });

  // Explore ALL style options on the formatting page
  console.log("\n=== Exploring style options ===");
  const styleOptions = await page.evaluate(() => {
    const result: Record<string, any> = {};

    // Look for style cards/thumbnails
    const cards = document.querySelectorAll(
      '[class*="card"], [class*="item"], [class*="template"], [class*="style"], [class*="theme"]'
    );
    result.cards = Array.from(cards).slice(0, 50).map(c => ({
      tag: c.tagName,
      class: c.className,
      text: (c as HTMLElement).textContent?.slice(0, 100)?.trim(),
    })).filter(c => c.text);

    // Look for color options
    const colorEls = document.querySelectorAll('[class*="color"], [style*="background-color"]');
    result.colors = Array.from(colorEls).slice(0, 30).map(el => ({
      tag: el.tagName,
      class: el.className,
      style: (el as HTMLElement).style?.cssText?.slice(0, 100),
      bgColor: (el as HTMLElement).style?.backgroundColor,
    }));

    // Tabs or categories
    const tabs = document.querySelectorAll('[class*="tab"], [role="tab"]');
    result.tabs = Array.from(tabs).map(t => ({
      text: (t as HTMLElement).textContent?.trim(),
      class: t.className,
      selected: t.getAttribute('aria-selected'),
    }));

    // All visible text for keyword search
    const allText = document.body.innerText;
    result.fullText = allText.slice(0, 5000);

    // Images that could be style previews
    const imgs = document.querySelectorAll('img[src*="template"], img[src*="style"], img[class*="preview"]');
    result.previewImgs = Array.from(imgs).slice(0, 10).map(img => ({
      src: (img as HTMLImageElement).src?.slice(0, 100),
      alt: (img as HTMLImageElement).alt,
      class: img.className,
    }));

    return result;
  });

  console.log("Cards:", JSON.stringify(styleOptions.cards?.slice(0, 20), null, 2));
  console.log("Colors:", JSON.stringify(styleOptions.colors?.slice(0, 15), null, 2));
  console.log("Tabs:", JSON.stringify(styleOptions.tabs, null, 2));
  console.log("Preview images:", JSON.stringify(styleOptions.previewImgs, null, 2));
  console.log("\nFull page text:\n", styleOptions.fullText);

  await client.disconnect();
}

main().catch(console.error);

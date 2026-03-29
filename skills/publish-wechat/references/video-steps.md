# 公众号视频（type=15）详细步骤

## Step 3b: 视频编辑器

```typescript
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("wechat-publish");

const TOKEN = "从Step2获取的token";
const VIDEO_PATH = "VIDEO_PATH_HERE";
const TITLE = "用户提供的标题";

// 跳转到视频编辑器
await page.goto(
  `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=15&token=${TOKEN}`,
  { waitUntil: "domcontentloaded", timeout: 30000 }
);
await waitForPageLoad(page);
await page.waitForTimeout(3000);

// 关闭弹幕提示（如有）
for (const btnText of ['知道了', '我知道了']) {
  try {
    const btn = page.getByText(btnText, { exact: true });
    if (await btn.isVisible({ timeout: 2000 })) await btn.click();
  } catch {}
}

// 上传视频
const fileInput = await page.$('input[type="file"][accept*="video"], input[type="file"]');
if (fileInput) {
  await fileInput.setInputFiles(VIDEO_PATH);
}

// 等待视频处理完成（最长 60 秒）
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(2000);
  const done = await page.evaluate(() =>
    document.body.innerText.includes('上传成功') || document.body.innerText.includes('重新上传')
  );
  if (done) break;
  if (i % 5 === 4) console.log(`视频处理中... (${(i + 1) * 2}s)`);
}

// 填标题 — 跳过"关键词"输入框
const titleInputs = await page.$$('input[type="text"].weui-desktop-form__input');
for (const input of titleInputs) {
  const placeholder = await input.getAttribute('placeholder') || '';
  if (!placeholder.includes('关键词') && await input.isVisible()) {
    await input.fill(TITLE.slice(0, 64));
    break;
  }
}

await page.screenshot({ path: "tmp/wechat-video-filled.png" });
await client.disconnect();
```

## 发布流程：保存草稿 → 草稿箱群发

公众号视频（type=15）只有"保存"按钮，不能直接发布。需要先保存为草稿，然后去草稿箱执行群发。

```typescript
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("wechat-publish");

const TOKEN = "从Step2获取的token";

// === 第一步：保存草稿 ===
const saveBtn = page.getByText('保存', { exact: true });
if (await saveBtn.isVisible({ timeout: 3000 })) {
  await saveBtn.click();
  console.log("视频已保存为草稿");
}

// 等待保存完成（弹出成功提示）
await page.waitForTimeout(3000);
const saved = await page.evaluate(() => {
  const text = document.body.innerText;
  return text.includes('保存成功') || text.includes('已保存');
});
console.log({ saved });

// === 第二步：导航到草稿箱 ===
await page.goto(
  `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_list&action=list_card&type=10&token=${TOKEN}`,
  { waitUntil: "domcontentloaded", timeout: 30000 }
);
await waitForPageLoad(page);
await page.waitForTimeout(3000);

await page.screenshot({ path: "tmp/wechat-drafts-list.png" });

// === 第三步：找到刚保存的草稿并点击群发 ===
// 草稿箱列表中，最新的草稿在最上面
// 找到第一条草稿的"群发"按钮
const massSent = await page.evaluate(() => {
  // Strategy 1: 找到草稿列表中第一条的操作区域
  const items = document.querySelectorAll('.weui-desktop-card, .card_appmsg_normal, [class*="appmsg_item"]');
  if (items.length > 0) {
    const firstItem = items[0] as HTMLElement;
    // hover 触发操作按钮显示
    firstItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    return 'found_item';
  }
  return null;
});

if (massSent) {
  await page.waitForTimeout(1000);

  // 点击"群发"按钮
  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('a, button, span, [class*="opr"]'));
    for (const btn of buttons) {
      const text = (btn as HTMLElement).textContent?.trim() || '';
      if (text === '群发' || text.includes('群发')) {
        (btn as HTMLElement).click();
        return text;
      }
    }
    return null;
  });
  console.log(`群发按钮: ${clicked}`);

  if (!clicked) {
    // Fallback: 通过 hover 第一个卡片后查找群发按钮
    const firstCard = await page.$('.weui-desktop-card, .card_appmsg_normal');
    if (firstCard) {
      await firstCard.hover();
      await page.waitForTimeout(800);
      const sendBtn = await page.$('a[title="群发"], [class*="send"]');
      if (sendBtn) await sendBtn.click();
    }
  }

  // === 第四步：确认群发 ===
  await page.waitForTimeout(2000);

  // 可能弹出确认对话框："确定群发吗？"
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, a'));
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || '';
      if (text === '发送' || text === '确定' || text === '群发') {
        (btn as HTMLElement).click();
        return text;
      }
    }
    return null;
  });

  // 可能触发管理员扫码验证
  await page.waitForTimeout(3000);
  const needsVerify = await page.evaluate(() => {
    const url = window.location.href;
    if (url.includes('safeverify') || url.includes('verify')) return true;
    if (document.querySelector('img[src*="qrcode"]')) return true;
    return false;
  });

  if (needsVerify) {
    console.log("需要管理员扫码验证，请在微信中确认");
    await page.screenshot({ path: "tmp/wechat-masssend-verify.png" });
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(1000);
      const verified = await page.evaluate(() =>
        !window.location.href.includes('safeverify') && !document.querySelector('img[src*="qrcode"]')
      );
      if (verified) break;
    }
  }

  // 等待群发结果
  await page.waitForTimeout(3000);
  const result = await page.evaluate(() => {
    const text = document.body.innerText;
    if (text.includes('发送成功') || text.includes('群发成功')) return 'success';
    if (text.includes('失败')) return 'failed';
    return 'unknown';
  });
  console.log({ massSendResult: result });
}

await page.screenshot({ path: "tmp/wechat-masssend-result.png" });
await client.disconnect();
```

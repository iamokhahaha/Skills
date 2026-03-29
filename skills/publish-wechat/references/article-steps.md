# 贴图（图片帖，type=77）详细步骤

## Step 3a: 贴图编辑器

```typescript
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("wechat-publish");

const TOKEN = "从Step2获取的token";
const IMAGES = ["path/to/1.jpg", "path/to/2.jpg"];  // 1-9 张
const TITLE = "用户提供的标题";
const BODY = "用户提供的描述";

// 直接跳转到贴图编辑器
await page.goto(
  `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=8&token=${TOKEN}`,
  { waitUntil: "domcontentloaded", timeout: 30000 }
);
await waitForPageLoad(page);
await page.waitForTimeout(3000);

// 检查是否在新标签页打开（公众号可能会）
let editorPage = page;
const allPages = (await client.list());
// 如果有多个页面，找包含 appmsg 的那个

// 上传图片 — 通过 hover 触发上传弹窗
const addArea = await editorPage.$('.image-selector__add');
if (addArea) {
  await addArea.hover();
  await page.waitForTimeout(500);

  // 点击上传按钮
  const uploadLink = await editorPage.$('.pop-opr__group-select-image .weui-desktop-upload__btn__wrp a');
  if (uploadLink) {
    const [fileChooser] = await Promise.all([
      editorPage.waitForEvent('filechooser', { timeout: 8000 }),
      uploadLink.click(),
    ]);
    await fileChooser.setFiles(IMAGES.slice(0, 9));
  }
} else {
  // Fallback: 直接找 file input
  const fileInput = await editorPage.$('input[type="file"]');
  if (fileInput) {
    await fileInput.setInputFiles(IMAGES.slice(0, 9));
  }
}

// 等待图片上传完成
await page.waitForTimeout(5000);
await editorPage.screenshot({ path: "tmp/wechat-images-uploaded.png" });

// 填标题 — #title textarea
const titleTextarea = await editorPage.$('#title');
if (titleTextarea) {
  await titleTextarea.fill(TITLE.slice(0, 20));
}

// 填描述 — 第一个 ProseMirror
const proseMirrors = await editorPage.$$('.ProseMirror');
if (proseMirrors.length > 0) {
  await proseMirrors[0].click();
  await page.waitForTimeout(300);

  // 用 HTML paste 保持段落结构
  await editorPage.evaluate((text) => {
    const pm = document.querySelector('.ProseMirror');
    if (!pm) return;
    const html = text.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
    const dt = new DataTransfer();
    dt.setData('text/html', html);
    const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    pm.dispatchEvent(event);
  }, BODY);
}

await editorPage.screenshot({ path: "tmp/wechat-tietu-filled.png" });
await client.disconnect();
```

## 贴图发布

```typescript
import { connect } from "@/client.js";

const client = await connect();
const page = await client.page("wechat-publish");

// 点击"发表"
const published = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button, a, .weui-desktop-btn'));
  for (const btn of buttons) {
    if (btn.textContent?.trim() === '发表') {
      (btn as HTMLElement).click();
      return '发表';
    }
  }
  return null;
});
console.log(`点击: ${published}`);

// 可能出现确认弹窗
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button, a'));
  for (const btn of buttons) {
    const text = btn.textContent?.trim() || '';
    if (text === '确定' || text === '确认发表' || text === '继续保存') {
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
  await page.screenshot({ path: "tmp/wechat-verify-qr.png" });
  // 等待验证完成（最长 2 分钟）
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(1000);
    const verified = await page.evaluate(() =>
      !window.location.href.includes('safeverify') && !document.querySelector('img[src*="qrcode"]')
    );
    if (verified) break;
  }
}

await page.screenshot({ path: "tmp/wechat-publish-result.png" });
await client.disconnect();
```

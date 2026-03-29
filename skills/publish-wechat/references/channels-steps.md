# 视频号详细步骤

## 架构注意：wujie 微前端

视频号后台使用 **wujie（无界）微前端**框架。实际表单内容在一个 `<wujie-app>` shadow DOM 中的 iframe 里：

- 外层 frame: `channels.weixin.qq.com/platform/post/create`
- wujie iframe: `channels.weixin.qq.com/micro/content/post/create`

**关键影响：**
- `page.$()` / `page.locator()` 无法直接选中 wujie iframe 内的元素
- 必须先获取 wujie frame，再用 `frame.evaluate()` 操作 DOM
- `page.setInputFiles()` / `fileChooser.setFiles()` 受 Playwright CDP 50MB 限制
- **大文件上传必须使用 `setFileServerSide()`**（见下方）

### 获取 wujie frame

```typescript
const frames = page.frames();
const wujieFrame = frames.find(f => f.url().includes("micro/content/post/create"));
// wujie frame 约需 15-20 秒完全加载
```

## Step 3c: 视频上传（≤50MB 用 setInputFiles，>50MB 用 server-side）

```typescript
import { connect, waitForPageLoad, setFileServerSide } from "@/client.js";

const client = await connect();
const page = await client.page("wechat-channels");
await page.setViewportSize({ width: 1280, height: 800 });

const VIDEO_PATH = "VIDEO_PATH_HERE";
const DESCRIPTION = "描述文本...";
const SHORT_TITLE = "短标题（6-16字）";

// 导航到视频号后台
await page.goto("https://channels.weixin.qq.com/platform/post/create", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await waitForPageLoad(page);

// 检查登录状态（可能需要微信扫码）
const needsLogin = await page.evaluate(() => {
  return !!document.querySelector('[class*="login"], [class*="qrcode"]')
    || document.body.innerText.includes('扫码登录');
});

if (needsLogin) {
  console.log("请用微信扫码登录视频号后台");
  await page.screenshot({ path: "tmp/wechat-channels-login.png" });
  for (let i = 0; i < 300; i++) {
    await page.waitForTimeout(1000);
    const loggedIn = await page.evaluate(() =>
      !document.querySelector('[class*="qrcode"]') && !document.body.innerText.includes('扫码登录')
    );
    if (loggedIn) break;
  }
}

// 等待 wujie iframe 加载（约 15-20 秒）
let wujieFrame = null;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(1000);
  wujieFrame = page.frames().find(f => f.url().includes("micro/content/post/create"));
  if (wujieFrame) {
    // 确认 file input 存在
    const hasInput = await wujieFrame.evaluate(() => !!document.querySelector('input[type="file"]'));
    if (hasInput) break;
  }
}

// ========== 上传视频 ==========
// 方法1: 小文件 (<50MB) - 直接 setInputFiles
// 方法2: 大文件 (>50MB) - 使用 server-side API（绕过 CDP 限制）
const fileSizeMB = /* 检查文件大小 */;

if (fileSizeMB > 50) {
  // 大文件：通过 dev-browser server 端直接操作 page 对象
  const result = await setFileServerSide("wechat-channels", VIDEO_PATH, {
    selector: 'input[type="file"]',
    frameUrl: "micro/content/post/create",  // 匹配 wujie iframe URL
  });
  console.log("Server-side upload result:", result);
  // result.method 可能是 "locator" 或 "filechooser"
} else {
  // 小文件：标准方式
  const fileInput = await wujieFrame.$('input[type="file"]');
  if (fileInput) await fileInput.setInputFiles(VIDEO_PATH);
}

// 等待视频处理完成（轮询）
for (let i = 0; i < 120; i++) {
  await page.waitForTimeout(3000);
  const status = await wujieFrame.evaluate(() => {
    const hasVideo = !!document.querySelector('video');
    const hasPreview = !!document.querySelector('[class*="cover-preview"], [class*="video-preview"]');
    return { hasVideo, hasPreview };
  });
  if (status.hasVideo || status.hasPreview) {
    console.log("视频上传完成");
    break;
  }
  if (i % 10 === 9) console.log(`视频处理中... (${(i + 1) * 3}s)`);
}

// ========== 填写描述 ==========
// 描述区域是 .input-editor (contenteditable div)，位于 .post-desc-box 内
// 直接设置 textContent，#话题 格式会自动被解析为富文本标签
await wujieFrame.evaluate((text) => {
  const editor = document.querySelector('.input-editor') as HTMLElement;
  if (!editor) throw new Error('.input-editor not found');
  editor.focus();
  editor.textContent = text;
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}, DESCRIPTION);

// ========== 填写短标题 ==========
// 短标题输入框: placeholder="概括视频主要内容，字数建议6-16个字符"
await wujieFrame.evaluate((title) => {
  const inputs = document.querySelectorAll('input.weui-desktop-form__input');
  for (const input of inputs) {
    const placeholder = (input as HTMLInputElement).placeholder || '';
    if (placeholder.includes('概括视频主要内容')) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value')!.set!;
      nativeInputValueSetter.call(input, title);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      break;
    }
  }
}, SHORT_TITLE);

await page.screenshot({ path: "tmp/wechat-channels-filled.png" });
await client.disconnect();
```

## 话题标签格式

视频号描述中的 `#话题` 格式（# + 文字，空格分隔）会被自动解析为 `<span class="hl topic" data-type="topic">` 富文本元素。**无需使用 "#话题" 按钮**，直接在描述文本中写 `#标签名` 即可。

```
正确: "#AI编程 #产品经理 #职业转型"
错误: "AI编程, 产品经理" (没有#前缀不会被识别为话题)
```

## 封面图

**发布时：** 不支持上传自定义封面。系统自动从视频首帧生成两种封面：
- **个人主页卡片**: 3:4 竖版
- **分享卡片**: 4:3 横版

发布页上可通过"编辑"按钮调整裁切区域（但仍基于视频帧，无法上传外部图片）。

**发表后修改封面：** 需在视频管理列表 (`/platform/post/list`) hover 视频条目 → 点击 **"修改描述和封面"** 按钮。
- 仅允许修改一次，修改后按钮变为 `disabled` 且提示"修改审核中"
- hover 后出现的操作栏：置顶 | 分享 | 弹幕管理 | 评论管理 | **修改描述和封面** | 可见权限 | 删除
- 操作栏元素选择器：`.opr` 容器，各操作项为 `.opr-item-wrap`，修改封面项为 `.edit-cover-item`

## dialog 处理

页面刷新/导航时可能触发 JS confirm 弹窗，需提前注册 handler 避免 Playwright 崩溃：
```typescript
page.on('dialog', async (d) => { await d.accept(); });
```

## 视频号发布按钮

```typescript
// 视频号：查找发布/发表按钮
const published = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button'));
  for (const btn of buttons) {
    const text = btn.textContent?.trim() || '';
    if (text === '发表' || text === '发布') {
      (btn as HTMLElement).click();
      return text;
    }
  }
  return null;
});
```

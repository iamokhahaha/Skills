# 发布流程（详细步骤参考）

## Step 1: 连接 Chrome 浏览器

通过 Chrome DevTools MCP 连接用户真实 Chrome 浏览器（CDP 端口 9222）。无需启动额外服务。

## Step 2: 检查登录 & 导航到创作者后台

```typescript
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("xiaoyuzhou-publish");
await page.setViewportSize({ width: 1280, height: 800 });

await page.goto("https://podcaster.xiaoyuzhoufm.com/", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await waitForPageLoad(page);

// 检查登录状态
const needsLogin = page.url().includes('/login') || page.url().includes('/passport');
const loginStatus = await page.evaluate(() => {
  // Strategy 1: 检查是否有节目列表/dashboard 内容
  const dashboard = document.querySelector('[class*="dashboard"], [class*="show-list"], [class*="podcast"]');
  if (dashboard) return { loggedIn: true, reason: 'dashboard' };
  // Strategy 2: 检查是否有用户头像/菜单
  const avatar = document.querySelector('[class*="avatar"], [class*="user"]');
  if (avatar) return { loggedIn: true, reason: 'avatar' };
  // Strategy 3: 检查是否有登录按钮
  const loginBtn = document.querySelector('[class*="login"], button');
  if (loginBtn && loginBtn.textContent?.includes('登录')) return { loggedIn: false, reason: 'login-btn' };
  return { loggedIn: false, reason: 'unknown' };
});

console.log({ needsLogin, ...loginStatus, url: page.url() });

if (needsLogin || !loginStatus.loggedIn) {
  console.log("请在浏览器中登录小宇宙创作者后台（手机号/微信扫码）");
  await page.screenshot({ path: "tmp/xiaoyuzhou-login.png" });
}
await client.disconnect();
```

**登录方式**：小宇宙创作者后台支持 **手机号+验证码** 和 **微信扫码** 登录。

## Step 3: 发现页面元素（ARIA Snapshot 方式）

```typescript
import { connect } from "@/client.js";

const client = await connect();
const snapshot = await client.getAISnapshot("xiaoyuzhou-publish");
console.log(snapshot);
// 在 snapshot 中查找：
// - 节目列表（选择要发布到的节目/播客）
// - "新建单集" / "发布单集" 按钮
// - 音频上传区域
// - 标题输入框
// - 简介编辑器
// - 封面设置
// - 发布时间设置
// - 发布/存草稿按钮
await client.disconnect();
```

## Step 4: 选择节目（播客）

```typescript
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("xiaoyuzhou-publish");

const SHOW_NAME = "用户指定的节目名"; // 用户已有的播客节目

// 在创作者后台首页应该能看到节目列表
// 点击目标节目进入节目管理页
const showSelected = await page.evaluate((target) => {
  const allEls = document.querySelectorAll('a, div, span, h2, h3');
  for (const el of allEls) {
    const text = el.textContent?.trim() || '';
    if (text.includes(target)) {
      el.click();
      return text;
    }
  }
  return null;
}, SHOW_NAME);

if (!showSelected) {
  // 可能需要通过列表或搜索找到节目
  console.log(`未找到节目 "${SHOW_NAME}"，请检查节目名称`);
  await page.screenshot({ path: "tmp/xiaoyuzhou-shows.png" });
}

await page.waitForTimeout(2000);
await client.disconnect();
```

## Step 5: 新建单集 & 上传音频

```typescript
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("xiaoyuzhou-publish");

const AUDIO_PATH = "AUDIO_FILE_PATH_HERE"; // MP3 或 M4A

// 点击"新建单集"按钮
const newEpisode = await page.evaluate(() => {
  const allEls = document.querySelectorAll('button, a, div, span');
  for (const el of allEls) {
    const text = el.textContent?.trim() || '';
    if (text === '新建单集' || text === '发布单集' || text === '创建单集' || text.includes('新单集')) {
      el.click();
      return text;
    }
  }
  return null;
});
console.log(newEpisode ? `已点击: ${newEpisode}` : "未找到新建单集按钮");
await page.waitForTimeout(3000);

// 上传音频文件
let fileInput = await page.$('input[type="file"][accept*="audio"]');
if (!fileInput) {
  fileInput = await page.$('input[type="file"][accept*=".mp3"], input[type="file"][accept*=".m4a"]');
}
if (!fileInput) {
  fileInput = await page.$('input[type="file"]');
}

if (fileInput) {
  await fileInput.setInputFiles(AUDIO_PATH);
  console.log("音频上传中...");
} else {
  // Fallback: 通过点击上传区域触发 filechooser
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 15000 }),
    page.evaluate(() => {
      const uploadArea = document.querySelector('[class*="upload"], [class*="drag"]');
      if (uploadArea) uploadArea.click();
    }),
  ]);
  await fileChooser.setFiles(AUDIO_PATH);
}

// 等待音频上传+处理完成
let uploaded = false;
for (let i = 0; i < 120; i++) {
  await page.waitForTimeout(2000);

  if (i % 15 === 14) {
    await page.screenshot({ path: "tmp/xiaoyuzhou-upload-progress.png" });
    console.log(`音频处理中... (${(i + 1) * 2}s)`);
  }

  const status = await page.evaluate(() => {
    const text = document.body.innerText;
    if (text.includes('上传完成') || text.includes('上传成功')) return 'done';
    // 检查是否出现了标题输入框（说明上传完成，进入编辑阶段）
    const titleInput = document.querySelector('input[placeholder*="标题"], [class*="title"] input');
    if (titleInput) return 'done';
    if (text.includes('上传失败') || text.includes('格式错误')) return 'failed';
    const progress = document.querySelector('[class*="progress"], [class*="uploading"]');
    if (progress) return 'uploading';
    return 'waiting';
  });

  if (status === 'done') { uploaded = true; break; }
  if (status === 'failed') {
    console.log("音频上传失败");
    break;
  }
}

console.log({ uploaded });
await page.screenshot({ path: "tmp/xiaoyuzhou-audio-uploaded.png" });
await client.disconnect();
```

## Step 6: 填写标题 + 简介（含时间戳章节）

```typescript
import { connect } from "@/client.js";

const client = await connect();
const page = await client.page("xiaoyuzhou-publish");

const TITLE = "单集标题";
const DESCRIPTION = `本期节目介绍...

时间戳章节：
00:00 开场白
02:30 主题一：XXX
08:15 主题二：YYY
15:00 主题三：ZZZ
22:45 听众问答
28:00 结尾`;

// 填标题
const titleInput = await page.$('input[placeholder*="标题"], input[placeholder*="单集"]')
  || await page.$('[class*="title"] input');

if (titleInput) {
  await titleInput.click();
  await page.waitForTimeout(300);
  await titleInput.fill(TITLE);
} else {
  // contenteditable 标题
  const titleEditable = await page.$('[class*="title"] [contenteditable="true"]');
  if (titleEditable) {
    await titleEditable.click();
    await page.waitForTimeout(300);
    await page.keyboard.type(TITLE, { delay: 10 });
  }
}

// 填简介 — 支持时间戳章节格式
const descEditor = await page.$('textarea[placeholder*="简介"], textarea[placeholder*="描述"]')
  || await page.$('[class*="desc"] [contenteditable="true"]')
  || await page.$('[contenteditable="true"]');

if (descEditor) {
  await descEditor.click();
  await page.waitForTimeout(300);
  const lines = DESCRIPTION.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) await page.keyboard.type(lines[i], { delay: 8 });
    if (i < lines.length - 1) await page.keyboard.press('Enter');
  }
}

await page.screenshot({ path: "tmp/xiaoyuzhou-content-filled.png" });
await client.disconnect();
```

### 时间戳章节格式说明

小宇宙支持在简介中使用时间戳标记章节，播放器会自动识别并生成章节跳转：

```
00:00 章节名称
MM:SS 章节名称
HH:MM:SS 章节名称（超过1小时时使用）
```

## Step 7: 上传封面图（可选）

```typescript
import { connect } from "@/client.js";

const client = await connect();
const page = await client.page("xiaoyuzhou-publish");

const COVER_IMAGE = null; // 封面图路径，null 则使用节目默认封面

if (COVER_IMAGE) {
  // 查找封面上传区域
  const coverBtn = await page.evaluate(() => {
    const allEls = document.querySelectorAll('button, div, span, label');
    for (const el of allEls) {
      const text = el.textContent?.trim() || '';
      if (text.includes('封面') || text.includes('上传封面') || text.includes('更换封面')) {
        el.click();
        return text;
      }
    }
    return null;
  });

  if (coverBtn) {
    await page.waitForTimeout(1500);
    const coverInput = await page.$('input[type="file"][accept*="image"]')
      || await page.$('input[type="file"]');
    if (coverInput) {
      await coverInput.setInputFiles(COVER_IMAGE);
      await page.waitForTimeout(3000);
      // 确认封面
      await page.evaluate(() => {
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          if (btn.textContent?.trim() === '确定' || btn.textContent?.trim() === '保存') {
            btn.click();
            return;
          }
        }
      });
    }
  }
}

await client.disconnect();
```

## Step 8: 设置发布时间（可选）

```typescript
import { connect } from "@/client.js";

const client = await connect();
const page = await client.page("xiaoyuzhou-publish");

const SCHEDULED = false; // true = 定时发布, false = 立即发布
const SCHEDULE_TIME = "2026-03-10 08:00"; // 仅当 SCHEDULED=true 时使用

if (SCHEDULED) {
  // 查找定时发布选项
  await page.evaluate(() => {
    const allEls = document.querySelectorAll('[class*="schedule"], [class*="time"], label, span');
    for (const el of allEls) {
      const text = el.textContent?.trim() || '';
      if (text.includes('定时') || text.includes('预约') || text.includes('发布时间')) {
        el.click();
        return text;
      }
    }
    return null;
  });
  await page.waitForTimeout(1500);

  // 填写定时发布时间
  const timeInput = await page.$('input[type="datetime-local"], input[placeholder*="时间"]');
  if (timeInput) {
    await timeInput.fill(SCHEDULE_TIME);
  }
}

await client.disconnect();
```

## Step 9: 截图确认 & 发布

```typescript
import { connect } from "@/client.js";

const client = await connect();
const page = await client.page("xiaoyuzhou-publish");

// 截图给用户确认
await page.screenshot({ path: "tmp/xiaoyuzhou-preview.png", fullPage: true });
console.log("请确认发布内容，截图已保存到 tmp/xiaoyuzhou-preview.png");

// ====== 用户确认后执行以下代码 ======

const publishClicked = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button'));
  for (const btn of buttons) {
    const text = btn.textContent?.trim() || '';
    if (text === '发布' || text === '发布单集' || text === '确认发布') {
      btn.click();
      return text;
    }
  }
  return null;
});
console.log(`发布按钮: ${publishClicked}`);

// 等待发布结果
let success = false;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(2000);
  const result = await page.evaluate(() => {
    const t = document.body.innerText;
    if (t.includes('发布成功') || t.includes('已发布')) return 'success';
    if (t.includes('失败') || t.includes('错误')) return 'failed';
    return 'pending';
  });
  if (result === 'success') { success = true; break; }
  if (result === 'failed') { break; }
}
console.log({ success });

await page.screenshot({ path: "tmp/xiaoyuzhou-result.png" });
await client.disconnect();
```

## Step 10: 获取单集 URL

```typescript
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("xiaoyuzhou-publish");

// 发布成功后可能跳转到单集详情页
let episodeUrl = page.url();
if (episodeUrl.includes('/episode/')) {
  console.log(`单集 URL: ${episodeUrl}`);
} else {
  // 回到节目管理页查找最新单集
  // 小宇宙的公开URL格式: https://www.xiaoyuzhou.com/episode/XXXXXX
  const latestEpisode = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="episode"]');
    if (links.length > 0) return links[0].href;
    return null;
  });
  console.log(`最新单集 URL: ${latestEpisode}`);
}

await client.disconnect();
```

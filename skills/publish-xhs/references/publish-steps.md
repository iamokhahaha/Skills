# 小红书发布 — 详细步骤

## Step 1: 启动 dev-browser

```bash
cd skills/dev-browser && ./server.sh &
# 或 extension 模式:
# cd skills/dev-browser && npm i && npm run start-extension &
```

等待 `Ready` 消息后继续。

## Step 2: 检查登录 & 导航到发布页

```typescript
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("xhs-publish");
await page.setViewportSize({ width: 1280, height: 800 });

await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await waitForPageLoad(page);

const needsLogin = page.url().includes("/login");
console.log({ needsLogin, url: page.url() });

if (needsLogin) {
  console.log("请在浏览器中扫码登录小红书");
  await page.screenshot({ path: "tmp/xhs-login.png" });
}
await client.disconnect();
```

如果需要登录：截图给用户看二维码 → 用户扫码 → 轮询直到 URL 不含 `/login`。

## Step 3: 切换标签 & 上传素材

### 3a. 视频 — "上传视频"（默认标签页）

```typescript
// 默认标签页是"上传视频"，无需切换
const fileInput = await page.$('input[type="file"]');
if (fileInput) {
  await fileInput.setInputFiles("VIDEO_PATH_HERE");
} else {
  const input = await page.$('input[accept*="video"]');
  if (input) await input.setInputFiles("VIDEO_PATH_HERE");
}

// 等待视频处理完成
let processed = false;
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(3000);
  const progress = await page.evaluate(() => {
    const processing = document.querySelector('[class*="progress"], [class*="uploading"], [class*="processing"]');
    const done = document.querySelector('[class*="uploaded"], [class*="success"], .publish-video-info');
    return { processing: !!processing, done: !!done };
  });
  if (progress.done && !progress.processing) { processed = true; break; }
  console.log(`等待视频处理... (${(i + 1) * 3}s)`);
}
```

### 3b. 图文 — "上传图文"

```typescript
// 切换到"上传图文"标签
await page.waitForSelector('div.upload-content', { timeout: 15000 });
await page.evaluate(() => {
  document.querySelectorAll('div.d-popover').forEach(el => el.remove());
  const tabs = document.querySelectorAll('div.creator-tab');
  for (const tab of tabs) {
    if (tab.textContent?.trim() === '上传图文') (tab as HTMLElement).click();
  }
});
await page.waitForTimeout(2000);

// 上传图片
const IMAGES = ["path/to/1.jpg", "path/to/2.jpg"];  // 1-18 张
const input = await page.waitForSelector('.upload-input', { timeout: 30000, state: 'attached' });
await input.setInputFiles(IMAGES);

// 等待图片处理完成
for (let t = 0; t < 60; t++) {
  const items = await page.$$('.img-preview-area .pr');
  if (items.length >= IMAGES.length) break;
  await page.waitForTimeout(1000);
}
```

### 3c. 长图文 — "写长文"

```typescript
// 切换到"写长文"标签
// Strategy A: getByText
try {
  const tab = page.getByText('写长文', { exact: true });
  await tab.waitFor({ state: 'visible', timeout: 8000 });
  await tab.click();
} catch {
  // Strategy B: TreeWalker fallback
  await page.evaluate(() => {
    document.querySelectorAll('.d-popover, [class*="popover"]').forEach(el => el.remove());
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.textContent?.trim() === '写长文' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    const textNode = walker.nextNode();
    if (textNode?.parentElement) textNode.parentElement.click();
  });
}
await page.waitForTimeout(3000);

// 可能出现"新的创作"按钮
const newCreation = await page.evaluate(() => {
  const allEls = document.querySelectorAll('button, a, div, span');
  for (const el of allEls) {
    const text = el.textContent?.trim() || '';
    if (text === '新的创作' || text === '开始创作') {
      (el as HTMLElement).click();
      return text;
    }
  }
  return null;
});
await page.waitForTimeout(5000);

// 检查是否在新标签页打开了编辑器
let editorPage = page;
for (const p of context.pages()) {
  if (p.url().includes('publish') && p !== page) { editorPage = p; break; }
}
```

**写长文的标题输入不同：**
```typescript
// 标题 — textarea（非 input），字数上限 64 字
const titleTextarea = await editorPage.$('textarea[placeholder*="标题"], textarea.d-text');
if (titleTextarea) {
  await titleTextarea.click();
  await page.waitForTimeout(200);
  await titleTextarea.fill(TITLE.slice(0, 64));  // 长图文标题限 64 字
}
```

**写长文的正文 — TipTap ProseMirror，用 clipboard paste（禁止 keyboard.type 逐字输入）：**
```typescript
if (BODY.length > 1000) {
  console.warn(`⚠️ 正文 ${BODY.length} 字超出平台 1000 字上限，请先 AI repurpose 精简后再发布`);
  process.exit(1);
}
const pm = await editorPage.$('.ProseMirror');
if (pm) {
  await pm.focus();
  await pm.click();
  await editorPage.waitForTimeout(300);
  await editorPage.evaluate((text: string) => {
    const editor = document.querySelector('.ProseMirror');
    if (editor) {
      const cd = new DataTransfer();
      cd.setData('text/plain', text);
      editor.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true, cancelable: true, clipboardData: cd,
      }));
    }
  }, BODY);
  await editorPage.waitForTimeout(1000);
}
```

**写长文发布流程 — 必须先选模板，才有"下一步"：**

> **重要**：长文编辑器初始只有"一键排版"和"暂存离开"两个按钮。
> **必须先点"一键排版"选择模板**，"下一步"按钮才会出现。
> "下一步"进入发布设置页（标题/标签/可见性），然后才能发布。

```typescript
// 1. 点击"一键排版"
await editorPage.locator("button").filter({ hasText: "一键排版" }).click();
await page.waitForTimeout(3000);

// 2. 选择模板（如"简约基础"、"杂志先锋"等）
await editorPage.locator("[class*='template']").first().click();
await page.waitForTimeout(3000);

// 3. 现在"下一步"按钮出现了
const nextBtn = editorPage.locator("button").filter({ hasText: /下一步/ });
// 可能需要等待图片生成完成（按钮会 disabled）
for (let i = 0; i < 30; i++) {
  if (!(await nextBtn.isDisabled())) break;
  await page.waitForTimeout(2000);
}
await nextBtn.click();
await page.waitForTimeout(5000);

// 4. 进入发布设置页 — 设可见性、点发布（同 Step 5.5 + Step 6）
```

**仅暂存不发布：**
```typescript
await editorPage.locator("button").filter({ hasText: "暂存离开" }).click();
```

## Step 4: 填写标题 + 正文 + 标签（视频/图文通用）

> 长图文的填写见 Step 3c，流程不同。以下适用于视频和图文。

### Step 4 前置检查（平台硬性限制，发布前必做）

| 字段 | 视频/图文 | 长图文 | 超限处理 |
|------|---------|-------|---------|
| 标题 | ≤ 20 字 | ≤ 64 字 | **AI repurpose 重写**更短标题，不要截断 |
| 正文 | ≤ 1000 字 | 无明确限制 | **AI repurpose 重写**精简到 800-950 字 |
| 标签 | ≤ 10 个 | ≤ 10 个 | 只保留最相关 10 个 |

**超限时绝不机械截断**（截断会导致内容不完整、逻辑断裂）。应触发 AI repurpose 重写，再把重写后的内容写回 JSON 重新发布。

脚本层面：发现超限时打印警告并 `process.exit(1)`，让外层流程处理 repurpose：
```typescript
if (BODY.length > 1000) {
  console.warn(`⚠️ 正文 ${BODY.length} 字超出 1000 字上限，请先 AI repurpose 精简`);
  process.exit(1);
}
if (TITLE.length > 20) {
  console.warn(`⚠️ 标题 ${TITLE.length} 字超出 20 字上限，请先 AI repurpose 重写`);
  process.exit(1);
}
```

```typescript
const TITLE = "用户提供的标题";
const BODY = "用户提供的正文";
const TAGS = ["标签1", "标签2"];

// 填标题 — 视频/图文用 input
const titleInput = await page.$('input[placeholder*="标题"], div.d-input input, input.c-input_inner');
if (titleInput) {
  await titleInput.click();
  await page.waitForTimeout(300);
  await titleInput.fill(TITLE.slice(0, 20));  // 视频/图文标题限 20 字
}

// 填正文（TipTap/ProseMirror 编辑器）
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
}

// 添加标签（如有）
if (TAGS.length > 0 && bodyEditor) {
  await bodyEditor.click();
  // 跳到正文末尾
  await page.keyboard.down("Meta");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.up("Meta");
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  for (const tag of TAGS) {
    await page.keyboard.type("#", { delay: 0 });
    await page.waitForTimeout(200);
    await page.keyboard.type(tag, { delay: 30 });
    await page.waitForTimeout(1500);

    // 选择标签建议（如果出现）
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
}
```

## Step 5: 勾选"笔记包含AI生成内容"（可选）

当用户要求标记 AI 内容时执行此步骤。

```typescript
// 小红书创作者平台的 AI 声明是一个 checkbox/toggle
// 在发布页底部的高级设置区域

// 策略 A: 滚动到底部找到 AI 声明选项
await page.evaluate(() => {
  window.scrollTo(0, document.body.scrollHeight);
});
await page.waitForTimeout(1000);

// 策略 B: 查找包含"AI"文字的 checkbox/switch
const aiChecked = await page.evaluate(() => {
  const allEls = document.querySelectorAll('label, span, div, p');
  for (const el of allEls) {
    const text = el.textContent?.trim() || '';
    if (text.includes('AI') && (text.includes('生成') || text.includes('创作') || text.includes('声明'))) {
      // 找到关联的 checkbox / switch / toggle
      const parent = el.closest('div, label, section');
      if (!parent) continue;
      const toggle = parent.querySelector(
        'input[type="checkbox"], [class*="switch"], [class*="toggle"], [class*="check"], [role="switch"], [role="checkbox"]'
      );
      if (toggle) {
        (toggle as HTMLElement).click();
        return `clicked: ${text}`;
      }
      // 如果整个区域可点击
      (el as HTMLElement).click();
      return `clicked-text: ${text}`;
    }
  }
  return null;
});
console.log({ aiChecked });

// 策略 C: 用 getByText 精确查找
if (!aiChecked) {
  try {
    const label = page.getByText(/AI.*生成|AI.*创作|笔记包含.*AI/);
    await label.waitFor({ state: 'visible', timeout: 5000 });
    await label.click();
  } catch {}
}

await page.screenshot({ path: "tmp/xhs-ai-declaration.png" });
```

## Step 5.5: 设置可见性（可选）

```typescript
// 滚动到底部，展开"更多设置"
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(1000);

// 点击可见性 dropdown — 必须用 Playwright locator
const permSelect = page.locator(".d-select-wrapper").filter({ hasText: "公开可见" });
await permSelect.click();
await page.waitForTimeout(1000);

// 选择选项
await page.getByText("仅自己可见").click();  // 或 "公开可见"、"仅互关好友可见"
await page.waitForTimeout(1000);
```

## Step 6: 发布 / 存草稿

> **重要**：发布按钮必须用 **Playwright locator `.click()`**，不能用 `page.evaluate(() => btn.click())`。
> XHS 创作者平台的 React 框架不响应原生 DOM `.click()`，只有 Playwright 的模拟点击才能触发真实事件。

```typescript
const DRAFT = false;

if (DRAFT) {
  // 存草稿 — 也需要用 locator
  await page.locator("button").filter({ hasText: /暂存/ }).click();
  console.log("草稿已保存");
} else {
  // 发布 — 必须用 Playwright locator
  await page.locator("button").filter({ hasText: /^发布$/ }).click();

  // 等待发布结果
  const startUrl = page.url();
  let success = false;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(2000);
    if (page.url() !== startUrl && !page.url().includes('/publish/publish')) {
      success = true; break;
    }
    const result = await page.evaluate(() => {
      const t = document.body.innerText;
      if (t.includes("发布成功") || t.includes("已发布")) return "success";
      if (t.includes("发布失败") || t.includes("违规")) return "failed";
      return "pending";
    });
    if (result === "success") { success = true; break; }
    if (result === "failed") { break; }
  }
  console.log({ success });
}

await page.screenshot({ path: "tmp/xhs-result.png" });
```

## 大文件上传（>50MB 视频）

dev-browser 通过 CDP 连接，Playwright 限制 CDP 文件传输最大 50MB。大视频必须用直连模式：

```typescript
// 1. 停止 dev-browser（不能同时使用同一 profile）
// 2. 直接用 launchPersistentContext
import { chromium } from "/Users/ayuu/.claude/skills/auto-dev-browser/node_modules/playwright/index.mjs";

const context = await chromium.launchPersistentContext(
  "/Users/ayuu/.claude/skills/auto-dev-browser/profiles/browser-data",
  { headless: false, viewport: { width: 1280, height: 800 } }
);
const page = await context.newPage();
// ... setInputFiles 不受 50MB 限制
await context.close(); // 完成后关闭，以便 dev-browser 重新启动
```

**注意**：直连模式需要用绝对路径导入 playwright 模块。

## 预览页发布流程

1. 生成 `publish-data.json` 到 `~/.claude/skills/media-publish-preview/public/`
2. 启动预览：`cd ~/.claude/skills/media-publish-preview && ./node_modules/.bin/vite --host`
3. 用户在 `localhost:5173` 编辑确认后点"发布"
4. 读取 `tmp/publish-trigger.json` 获取发布数据和 headless 选项
5. 执行浏览器自动化发布

## 风控注意

- 操作间 `waitForTimeout(800-3000)` 随机延迟
- `keyboard.type({ delay: 5-30 })` 模拟真人速度
- 不用 clipboard paste（易被检测）
- 遇验证码 → 截图通知用户手动处理

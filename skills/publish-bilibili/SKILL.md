---
name: publish-bilibili
description: "发布内容到B站。支持视频投稿、专栏文章两种类型，直接发布或 repurpose 适配。触发词：发B站、发布B站、上传B站、bilibili publish、B站投稿"
---

# B站发布 Skill

两种发布方式：
- **视频投稿** — 优先使用 **API 直传**（无文件大小限制，更快更稳定）
- **专栏文章** — 使用 **Playwright 浏览器自动化**

两种模式：**直接发布**（素材已备好）和 **Repurpose**（需要适配优化）。

## 判断模式

素材齐全（文件 + 标题 + 简介）→ **直接发布**（默认）
用户说"帮我优化"、"适配B站" → **Repurpose + 发布**

## 持久化脚本（固定脚本，不要重新生成）

| 类型 | 脚本路径 | 说明 |
|------|---------|------|
| 视频投稿 | `scripts/publish-video.ts` | API 直传，带重试 + 进度 + 结果 JSON |
| 专栏文章 | `scripts/publish-article.ts` | Playwright 自动化，多选择器降级 |

### 使用方式

1. 读取对应脚本文件
2. 修改脚本顶部的 `POST` 对象（填入实际内容）
3. **用户确认** — 将标题、简介、标签、封面比例展示给用户确认，用户 OK 后才执行发布
4. 运行:

```bash
npx tsx ~/.claude/skills/publish-bilibili/scripts/publish-video.ts
# 或
npx tsx ~/.claude/skills/publish-bilibili/scripts/publish-article.ts
```

4. 结果输出到 `tmp/bilibili-publish-result.json`

### 加固特性

- **fetchRetry**: API 调用自动重试 3 次（指数退避）
- **多选择器降级**: 标题/正文编辑器尝试多种 CSS 选择器
- **clipboard paste**: 正文用 ClipboardEvent 粘贴（不用 keyboard.type）
- **输入验证**: 启动前检查文件存在、标题非空
- **截图诊断**: 失败时自动截图到 `tmp/`
- **登录等待**: 未登录时等待最多 5 分钟
- **结果 JSON**: 无论成功失败都写结果文件

> **重要**: 不要重新生成这些脚本！如果遇到 bug，直接修改脚本文件本身。

---

# Part A: 视频投稿（API 直传）

> **推荐方式**。不依赖 Playwright 页面操作，支持任意大小视频文件，上传速度 5-10MB/s。

## 输入

| 项目 | 必填 | 说明 |
|------|------|------|
| 视频文件 | ✅ | MP4/H.264 推荐 |
| 标题 | ✅ | ≤ 80 字 |
| 简介 | ✅ | ≤ 2000 字 |
| 标签 | 可选 | ≤ 10 个，每个 ≤ 20 字，逗号分隔 |
| 封面图 | 可选 | 需准备 **4:3** 和 **16:9** 两种比例（见封面说明） |
| 分区 tid | 可选 | 默认 124（社科人文） |

## Step 1: 获取 Cookies

通过 Chrome DevTools MCP 连接用户真实 Chrome 浏览器（CDP 端口 9222），从已登录会话中提取 cookies。

```typescript
import { connect, waitForPageLoad } from "@/client.js";
import * as fs from 'fs';

const client = await connect();
const page = await client.page("bilibili-publish");
await page.setViewportSize({ width: 1280, height: 800 });

// 先访问B站确认登录状态
await page.goto("https://www.bilibili.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
await waitForPageLoad(page);

const loginStatus = await page.evaluate(() => {
  const loginBtn = document.querySelector('.header-login-entry, [class*="login-btn"]');
  const userMenu = document.querySelector('.header-avatar-wrap, [class*="header-entry-avatar"]');
  if (!loginBtn && userMenu) return { loggedIn: true };
  return { loggedIn: false };
});

if (!loginStatus.loggedIn) {
  console.log("未登录，请先在浏览器中登录B站");
  await page.screenshot({ path: "tmp/bilibili-login.png" });
  await client.disconnect();
  process.exit(1);
}

// 提取 cookies
const cookies = await page.context().cookies();
const biliCookies = cookies.filter(c => c.domain.includes('bilibili'));
const cookieStr = biliCookies.map(c => `${c.name}=${c.value}`).join('; ');

// 提取关键值
const SESSDATA = biliCookies.find(c => c.name === 'SESSDATA')?.value;
const bili_jct = biliCookies.find(c => c.name === 'bili_jct')?.value; // CSRF token

fs.writeFileSync('tmp/bili-cookie-string.txt', cookieStr);
console.log("Cookies saved. SESSDATA:", SESSDATA ? 'OK' : 'MISSING', "bili_jct:", bili_jct ? 'OK' : 'MISSING');
await client.disconnect();
```

## Step 2: Preupload（获取上传地址）

```typescript
const COOKIE = fs.readFileSync('tmp/bili-cookie-string.txt', 'utf-8').trim();
const VIDEO_PATH = "VIDEO_PATH_HERE";
const fileSize = fs.statSync(VIDEO_PATH).size;
const fileName = path.basename(VIDEO_PATH);

// ⚠️ profile 必须是 ugcupos/bup（不是 ugcfx/bup，否则 init 会 400）
const preuploadUrl = `https://member.bilibili.com/preupload?name=${encodeURIComponent(fileName)}&size=${fileSize}&r=upos&profile=ugcupos%2Fbup&ssl=0&version=2.8.12&build=2081200`;

const preRes = await fetch(preuploadUrl, { headers: { 'Cookie': COOKIE } });
const preData = await preRes.json();
// preData: { OK, endpoint, upos_uri, auth, chunk_size, biz_id, endpoints[] }
```

## Step 3: Init Upload（初始化分片上传）

```typescript
const uposUri = preData.upos_uri.replace('upos://', '');
const baseUrl = 'https:' + preData.endpoint;
const auth = preData.auth;

const initRes = await fetch(`${baseUrl}/${uposUri}?uploads&output=json`, {
  method: 'POST',
  headers: { 'X-Upos-Auth': auth },
});
const { upload_id } = await initRes.json();
```

## Step 4: 分片上传

```typescript
const chunkSize = preData.chunk_size; // 通常 10MB
const totalChunks = Math.ceil(fileSize / chunkSize);

const fd = fs.openSync(VIDEO_PATH, 'r');
const buffer = Buffer.alloc(chunkSize);

for (let i = 0; i < totalChunks; i++) {
  const offset = i * chunkSize;
  const bytesRead = fs.readSync(fd, buffer, 0, chunkSize, offset);
  const chunk = buffer.subarray(0, bytesRead);

  const chunkUrl = `${baseUrl}/${uposUri}?partNumber=${i+1}&uploadId=${upload_id}&chunk=${i}&chunks=${totalChunks}&size=${bytesRead}&start=${offset}&end=${offset+bytesRead}&total=${fileSize}`;

  await fetch(chunkUrl, {
    method: 'PUT',
    headers: { 'X-Upos-Auth': auth, 'Content-Type': 'application/octet-stream' },
    body: chunk,
  });
}
fs.closeSync(fd);
```

## Step 5: Complete Upload

```typescript
const parts = Array.from({ length: totalChunks }, (_, i) => ({ partNumber: i + 1, eTag: 'etag' }));
const completeUrl = `${baseUrl}/${uposUri}?output=json&name=${encodeURIComponent(fileName)}&profile=ugcupos%2Fbup&uploadId=${upload_id}&biz_id=${preData.biz_id}`;

const completeRes = await fetch(completeUrl, {
  method: 'POST',
  headers: { 'X-Upos-Auth': auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ parts }),
});
const completeData = await completeRes.json();
// completeData: { OK: 1, bucket, key, location }

const biliFilename = uposUri.split('/').pop()?.replace('.mp4', '');
```

## Step 6: 上传封面图（可选）

B站封面有两种展示比例，建议都准备：

| 展示位置 | 比例 | 推荐尺寸 | 说明 |
|---------|------|---------|------|
| **首页推荐封面** | **4:3** | 1440×1080 | 首页信息流、搜索结果中展示 |
| **个人空间封面** | **16:9** | 1920×1080 | 视频播放页、个人空间中展示 |

> ⚠️ B站上传封面时会同时展示 4:3 和 16:9 两种裁切预览，需确认两种比例下重要内容（文字/人脸）都不被裁切。建议设计封面时留出安全区域。

```typescript
// 上传封面到B站图床
const COVER_PATH = "COVER_PATH_HERE"; // 建议 4:3 或 16:9
const CSRF = "bili_jct_value";

const coverForm = new FormData();
coverForm.append('file', new Blob([fs.readFileSync(COVER_PATH)]), 'cover.png');
coverForm.append('csrf', CSRF);

const coverRes = await fetch('https://member.bilibili.com/x/vu/web/cover/up', {
  method: 'POST',
  headers: { 'Cookie': COOKIE },
  body: coverForm,
});
const coverData = await coverRes.json();
const coverUrl = coverData.data?.url; // B站图床 URL，用于提交投稿
```

## Step 7: 提交投稿

```typescript
const CSRF = "bili_jct_value";

const submitData = {
  copyright: 1,             // 1=原创, 2=转载
  videos: [{ filename: biliFilename, title: "", desc: "", cid: 0 }],
  source: "",               // 转载时填原始 URL
  tid: 124,                 // 分区 ID（见下方分区表）
  cover: coverUrl || "",    // 封面图 URL（从 Step 6 获取，空则自动截帧）
  title: "视频标题",         // ≤ 80 字
  desc_format_id: 0,
  desc: "视频简介",          // ≤ 2000 字
  dynamic: "",
  subtitle: { open: 0, lan: "" },
  tag: "标签1,标签2,标签3",  // 逗号分隔，≤ 10 个
  dtime: 0,                 // 定时发布时间戳（0=立即）
  open_elec: 0,
  no_reprint: 1,            // 1=未经作者授权禁止转载
  mission_id: 0,
  dolby: 0,
  lossless_music: 0,
  up_selection_reply: false,
  up_close_reply: false,
  up_close_danmu: false,
  web_os: 1,
};

const submitRes = await fetch(`https://member.bilibili.com/x/vu/web/add?csrf=${CSRF}`, {
  method: 'POST',
  headers: {
    'Cookie': COOKIE,
    'Content-Type': 'application/json',
    'Referer': 'https://member.bilibili.com/platform/upload/video/frame',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Origin': 'https://member.bilibili.com',
  },
  body: JSON.stringify(submitData),
});

const result = await submitRes.json();
// 成功: { code: 0, data: { aid, bvid } }
// 失败: { code: 21001, message: "参数错误" }
```

### 常用分区 ID

| tid | 分区 |
|-----|------|
| 17 | 单机游戏 |
| 95 | 数码 |
| 122 | 野生技术协会 |
| 124 | 社科·法律·心理 |
| 138 | 搞笑 |
| 183 | 影视杂谈 |
| 188 | 计算机技术 |
| 201 | 科学科普 |
| 208 | 人文历史 |
| 231 | 计算机技术（新） |

---

# Part B: 专栏文章（浏览器自动化）

专栏文章使用 Playwright 浏览器自动化，因为专栏编辑器是富文本，API 方式较复杂。

## Step 1: 连接 Chrome 浏览器

通过 Chrome DevTools MCP 连接用户真实 Chrome 浏览器（CDP 端口 9222）。无需启动额外服务。

## Step 2: 填写文章

```typescript
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("bilibili-publish");

await page.goto("https://member.bilibili.com/platform/upload/text/edit", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await waitForPageLoad(page);
await page.waitForTimeout(3000);

const TITLE = "文章标题";
const BODY = "文章正文";

// 填标题 — contenteditable 元素
const titleEl = await page.$('[data-placeholder*="标题"], [placeholder*="标题"]');
if (titleEl) {
  await titleEl.click();
  await page.waitForTimeout(200);
  await page.keyboard.type(TITLE.slice(0, 80), { delay: 10 });
}

// 填正文
const bodyEl = await page.$('[data-placeholder*="正文"], [placeholder*="正文"]');
if (bodyEl) {
  await bodyEl.click();
  await page.waitForTimeout(300);
  const lines = BODY.slice(0, 2000).split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) await page.keyboard.type(lines[i], { delay: 5 });
    if (i < lines.length - 1) await page.keyboard.press('Enter');
  }
}

await page.screenshot({ path: "tmp/bilibili-article-filled.png" });
await client.disconnect();
```

## Step 3: 发布 / 存草稿

```typescript
const DRAFT = true; // 默认存草稿

if (DRAFT) {
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"], span'));
    for (const btn of buttons) {
      if (["保存为草稿", "保存草稿", "存草稿"].some(t => btn.textContent?.includes(t))) {
        (btn as HTMLElement).click();
        return;
      }
    }
  });
} else {
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const btn of buttons) {
      if (btn.textContent?.trim() === '发布') { btn.click(); return; }
    }
  });
}
```

---

# Part C: Repurpose（可选）

**仅在用户明确要求时使用。**

## C1. 视频格式适配

```bash
ffprobe -v quiet -print_format json -show_format -show_streams "$VIDEO_PATH"
```

| 问题 | 处理 |
|------|------|
| 非 MP4/H.264 | `ffmpeg -i in -c:v libx264 -crf 23 -c:a aac -movflags +faststart out.mp4` |
| 超出文件大小 | 普通用户 8GB，大会员 32GB（一般不需要压缩） |
| 比例不对 | B站推荐 16:9，竖屏 9:16 也支持 |

## C2. 文案优化

### 标题（≤ 80 字）
- B站用户偏好信息密度高的标题
- 可用【】标注分类：【教程】【测评】【日常】
- 适当使用疑问句引发好奇

### 简介/正文（≤ 2000 字）
- 简介区放视频要点概述 + 时间轴索引
- 专栏文章正文支持富文本，但建议简洁

### 标签（≤ 10 个，每个 ≤ 20 字）
- 精准描述内容主题
- 利用热门标签增加曝光

## C3. 封面图适配

B站封面需要同时在 **4:3** 和 **16:9** 两种比例下展示良好：

```bash
# 从 16:9 原图裁切 4:3 版本（居中裁切）
ffmpeg -i cover-16x9.png -vf "crop=ih*4/3:ih" cover-4x3.png

# 从 4:3 原图扩展 16:9 版本（加黑边 / 模糊背景）
ffmpeg -i cover-4x3.png -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black" cover-16x9.png
```

> 设计封面时将核心内容（标题文字、人脸）放在中心安全区域，确保 4:3 裁切时不丢失重要信息。

---

# 平台规格速查

| 项目 | 视频投稿 | 专栏文章 |
|------|---------|---------|
| 发布方式 | **API 直传**（推荐） | 浏览器自动化 |
| 标题上限 | 80 字 | 80 字 |
| 简介/正文上限 | 2000 字 | 2000 字 |
| 标签 | ≤ 10 个，每个 ≤ 20 字 | — |
| 文件大小 | 普通 8GB / 大会员 32GB | — |
| 时长 | ≤ 2 小时 | — |
| 分辨率 | 1080p / 4K 推荐 | — |
| 比例 | 16:9（推荐）, 9:16, 1:1 | — |
| 编码 | H.264 | — |
| 封面-首页推荐 | **4:3**（1440×1080） | — |
| 封面-个人空间 | **16:9**（1920×1080） | — |
| 审核 | 通常 1-24 小时 | 通常 1-24 小时 |

## 风控注意

- B站有 **412 安全风控策略**，频繁请求同一页面会触发拦截
- API 直传方式比浏览器操作更不容易触发风控
- 视频投稿需要审核（通常 1-24 小时），审核期间视频页面显示"视频不见了"属于正常
- 建议投稿间隔 ≥ 5 分钟

## 依赖

- infra-browser skill（获取登录 cookies + 专栏文章自动化）
- ffmpeg / ffprobe（仅 repurpose 需要）
- B站账号（已在浏览器中登录）

## API 认证说明

视频 API 直传需要以下 cookies：

| Cookie | 用途 |
|--------|------|
| `SESSDATA` | 用户会话凭证 |
| `bili_jct` | CSRF token（用于 add 接口的 csrf 参数） |
| `DedeUserID` | 用户 UID |

从 infra-browser 的浏览器会话中通过 `page.context().cookies()` 提取。

## 参考

- 视频投稿页：`https://member.bilibili.com/platform/upload/video/frame`
- 专栏编辑页：`https://member.bilibili.com/platform/upload/text/edit`
- API 参考：[biliup/biliup](https://github.com/biliup/biliup) — 开源 B站上传工具
- 封面上传：`POST https://member.bilibili.com/x/vu/web/cover/up`（FormData: file + csrf）

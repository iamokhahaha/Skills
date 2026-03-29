---
name: publish-wechat
description: "发布内容到公众号和视频号。支持贴图、视频、视频号三种类型，直接发布或 repurpose 适配。触发词：发公众号、发布公众号、发视频号、公众号发布、wechat publish"
---

# 公众号 & 视频号发布 Skill

两种模式：**直接发布**（素材已备好）和 **Repurpose**（需要适配优化）。
三种内容类型：**贴图**（图片帖）、**视频**（公众号视频）、**视频号**（微信视频号）。

## 判断模式

素材齐全（文件 + 标题 + 正文）→ **直接发布**（默认）
用户说"帮我优化"、"适配公众号" → **Repurpose + 发布**

## 持久化脚本（固定脚本，不要重新生成）

| 类型 | 脚本路径 | 说明 |
|------|---------|------|
| 长文章（图文消息） | `scripts/publish-article.ts` | 公众号 type=10，富文本+封面+摘要，保存草稿→群发 |
| 贴图（图片帖） | `scripts/publish-post.ts` | 公众号 type=77，图片上传 + 标题描述 |
| 公众号视频 | `scripts/publish-video.ts` | type=15，独立视频消息，保存草稿→群发 |
| 视频号 | `scripts/publish-videohao.ts` | channels.weixin.qq.com，wujie iframe |

### 使用方式

1. 读取对应脚本文件
2. 修改脚本顶部的 `POST` 对象
3. **用户确认** — 将标题、正文/描述、标签展示给用户确认，用户 OK 后才执行发布
4. 运行:

```bash
npx tsx ~/.claude/skills/publish-wechat/scripts/publish-article.ts
# 或 scripts/publish-post.ts / scripts/publish-video.ts / scripts/publish-videohao.ts
```

4. 结果输出到 `tmp/wechat-publish-result.json`

### 加固特性

- **dialog handler**: 预注册 `page.on('dialog')` 防止 Playwright 崩溃
- **token 自动提取**: 登录后自动从 URL 提取 token
- **管理员验证等待**: safeverify 扫码最多等 2 分钟
- **wujie iframe 等待**: 视频号 40 秒轮询 wujie frame 加载
- **大文件 server-side**: >50MB 自动用 setFileServerSide 绕过 CDP 限制
- **nativeInputValueSetter**: Vue 响应式输入框绕过
- **截图诊断**: 每个关键步骤失败时截图

> **重要**: 不要重新生成这些脚本！如果遇到 bug，直接修改脚本文件本身。

## 判断内容类型

| 用户给了 | 类型 | 编辑器 URL 参数 |
|---------|------|---------------|
| 图片（1-9张）| 贴图 (type=77) | `type=77&createType=8` |
| 视频文件 + 发公众号 | 公众号视频 (type=15) | `type=15` |
| 视频文件 + 发视频号 | 视频号 | `channels.weixin.qq.com` |

---

# Part A: 直接发布

## 输入

| 项目 | 必填 | 说明 |
|------|------|------|
| 素材文件 | Yes | 图片（1-9张）/ 视频文件 |
| 标题 | Yes | 贴图 ≤ 20 字，视频 ≤ 64 字 |
| 正文/描述 | Yes | 原样使用 |
| 草稿模式 | 可选 | 默认直接发布 |

**不做任何修改。**

## Step 1: 连接 Chrome 浏览器

通过 Chrome DevTools MCP 连接用户真实 Chrome 浏览器（CDP 端口 9222）。无需启动额外服务。

## Step 2: 检查登录 & 获取 Token

```typescript
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("wechat-publish");
await page.setViewportSize({ width: 1280, height: 800 });

await page.goto("https://mp.weixin.qq.com/", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await waitForPageLoad(page);
await page.waitForTimeout(3000);

const url = page.url();
const needsLogin = url.includes('/login') || url.includes('action=scanlogin');

if (needsLogin) {
  console.log("请在浏览器中扫码登录公众号");
  await page.screenshot({ path: "tmp/wechat-login-qr.png" });
  for (let i = 0; i < 300; i++) {
    await page.waitForTimeout(1000);
    const currentUrl = page.url();
    if (currentUrl.includes('/cgi-bin/home') || currentUrl.includes('/cgi-bin/frame')) {
      console.log("登录成功");
      break;
    }
  }
}

const token = page.url().match(/token=(\d+)/)?.[1] || '';
console.log({ loggedIn: !needsLogin || token, token });
await client.disconnect();
```

**登录检测选择器：**
- `.weui-desktop-account__info` — 后台首页账号信息
- `.new-home__card` — 新版首页卡片
- URL 包含 `/cgi-bin/home` 或 `/cgi-bin/frame`

## Step 3: 按类型填写内容

每种类型的详细步骤（选择器、代码示例）见 `references/` 目录：

| 类型 | 详细步骤 | 关键要点 |
|------|---------|---------|
| 贴图 (type=77) | [`references/article-steps.md`](references/article-steps.md) | hover `.image-selector__add` 触发上传；`#title` 填标题；`.ProseMirror` clipboard paste 填描述 |
| 公众号视频 (type=15) | [`references/video-steps.md`](references/video-steps.md) | `input[type="file"]` 上传；轮询等待处理完成；跳过"关键词"输入框填标题 |
| 视频号 | [`references/channels-steps.md`](references/channels-steps.md) | wujie 微前端架构，必须获取 wujie frame 操作；>50MB 用 `setFileServerSide()`；`.input-editor` 填描述；`nativeInputValueSetter` 填短标题 |

## Step 4: 发布 / 存草稿

| 类型 | 发布方式 | 详细步骤 |
|------|---------|---------|
| 贴图 | 点击"发表" → 确认弹窗 → 可能需管理员扫码 | [`references/article-steps.md`](references/article-steps.md) |
| 公众号视频 | "保存"草稿 → 草稿箱找到条目 → 点击"群发" → 确认 → 可能需管理员扫码 | [`references/video-steps.md`](references/video-steps.md) |
| 视频号 | 点击"发表"/"发布"按钮 | [`references/channels-steps.md`](references/channels-steps.md) |

## 风控注意

- 操作间 `waitForTimeout(1000-3000)` 随机延迟
- 公众号发布可能触发管理员扫码验证（安全设置相关）
- 视频号建议每天 ≤ 3-5 条
- 公众号订阅号每天 1 次群发，服务号每月 4 次

---

# Part B: Repurpose（可选）

**仅在用户明确要求时使用。**

## B1. 视频格式适配

| 平台 | 推荐比例 | 推荐分辨率 | 大小限制 |
|------|---------|-----------|---------|
| 公众号视频 | 16:9 | 1920x1080 | 200MB（内嵌） |
| 视频号 | 9:16（推荐）| 1080x1920 | 2GB |

## B2. 图片适配（贴图）

- 封面比例：2.35:1（900x383px 推荐）
- 单张 ≤ 10MB，JPEG/PNG
- 最多 9 张

## B3. 文案优化

- **贴图标题**（≤ 20 字）：公众号风格偏正式/信息量大
- **公众号视频标题**（≤ 64 字）：可以更详细描述
- **视频号描述**（≤ 1000 字）：简短有力，前两行最关键（折叠显示），添加话题标签 `#话题名`

---

# 平台规格速查

| 项目 | 贴图 (type=77) | 公众号视频 (type=15) | 视频号 |
|------|---------------|---------------------|--------|
| 平台 | mp.weixin.qq.com | mp.weixin.qq.com | channels.weixin.qq.com |
| 标题上限 | 20 字 | 64 字 | — |
| 描述上限 | — | — | 1000 字 |
| 图片 | 1-9 张，≤10MB/张 | — | ≤ 9 张 |
| 视频 | — | ≤ 200MB | ≤ 2GB |
| 视频时长 | — | — | 3秒-60分钟 |
| 视频比例 | — | 16:9 推荐 | 9:16 推荐 |
| 封面 | 2.35:1 (900x383) | — | 自动首帧（个人主页3:4 + 分享4:3）|
| 短标题 | — | — | 6-16 字 |
| 话题格式 | — | — | `#话题名` (空格分隔) |
| 微前端 | — | — | wujie (无界) |
| 发布按钮 | "发表" | "保存"（仅草稿）| "发表" / "保存草稿" |
| 验证 | 可能需管理员扫码 | 可能需管理员扫码 | 微信扫码登录 |
| 群发限制 | 订阅号1次/天 | — | — |

## 依赖

- infra-browser skill（Playwright 浏览器自动化）
- ffmpeg / ffprobe（仅 repurpose 需要）
- 公众号账号 / 视频号账号（已在浏览器中登录）

## 参考

- 公众号后台：`https://mp.weixin.qq.com/`
- 视频号后台：`https://channels.weixin.qq.com/`
- 详细贴图步骤：[`references/article-steps.md`](references/article-steps.md)
- 详细视频步骤：[`references/video-steps.md`](references/video-steps.md)
- 详细视频号步骤：[`references/channels-steps.md`](references/channels-steps.md)

---
name: publish-xhs
description: "发布视频/图文到小红书。支持视频、图文、长图文三种类型，可标记AI生成内容。触发词：发小红书、发布小红书、上传小红书、xhs publish、小红书发布"
---

# 小红书发布 Skill

两种模式：**直接发布**（素材已备好）和 **Repurpose**（需要适配优化）。
三种内容类型：**视频**、**图文**（上传图文）、**长图文**（写长文）。

## 判断模式

素材齐全（文件 + 标题 + 正文）→ **直接发布**（默认）
用户说"帮我优化"、"适配小红书"、只给了素材没给文案 → **Repurpose + 发布**

## 判断内容类型

| 用户给了 | 类型 | 发布页标签 |
|---------|------|-----------|
| 视频文件 | 视频 | "上传视频"（默认标签，无需切换） |
| 图片文件（1-18 张） | 图文 | "上传图文" |
| 长文（纯文字/Markdown） | 长图文 | "写长文" |

---

# Part A: 直接发布

用户已准备好所有素材，原封不动发上去。

## 输入

| 项目 | 必填 | 说明 |
|------|------|------|
| 素材文件 | Y | 视频文件 / 图片文件（1-18张）/ 无（长图文） |
| 标题 | Y | 原样使用 |
| 正文 | Y | 原样使用 |
| 标签 | 可选 | 原样使用 |
| 封面图 | 可选 | 仅视频需要，无则平台自动选帧 |
| AI 声明 | 可选 | 勾选"笔记包含AI生成内容"（默认不勾） |
| 草稿模式 | 可选 | 默认直接发布，可选存草稿 |
| 定时发布 | 可选 | ISO datetime 如 "2026-03-12T10:00"，范围：15分钟~30天 |

**不做任何修改** — 不转码、不裁切、不改标题、不优化正文。直接走浏览器自动化。

## 发布流程概要

1. **生成发布 JSON** — 根据素材准备 `tmp/xhs-publish-data-{topic}.json`
2. **用户确认** — 将标题、正文（post 描述）、标签展示给用户确认，用户 OK 后才执行发布
3. **启动 infra-browser** — `./server.sh &`，等待 Ready
4. **检查登录** — 导航到 `creator.xiaohongshu.com/publish/publish`，如需登录截图给用户扫码
5. **切换标签 & 上传素材** — 视频默认标签 / 图文切换"上传图文" / 长图文切换"写长文"
6. **填写标题 + 正文 + 标签** — 视频/图文用 input + ProseMirror；长图文用 textarea + clipboard paste
7. **AI 声明**（可选）— 展开"内容设置"，选择"笔记含AI合成内容"
8. **设置可见性**（可选）— 展开"更多设置"，选择可见性
9. **发布 / 存草稿** — 必须用 Playwright locator `.click()`（不能用 `page.evaluate`）

**重要**：步骤 2 是必须的。发布前必须先将标题、正文、标签展示给用户确认。正文是 post 描述（显示在图片下方），不是图片里的内容。

详细步骤和完整代码见 `references/publish-steps.md`。

## 关键约束

- **正文填写**：必须用 clipboard paste（ClipboardEvent），禁止 keyboard.type() 逐字输入
- **正文超限**（>1000 字）：脚本打印警告并 `process.exit(1)`，由外层 skill 触发 AI repurpose 重写（不截断）
- **标题超限**（视频/图文 >20 字，长图文 >64 字）：同上，AI repurpose 重写而非截断
- **点击按钮**：必须用 `page.mouse.click(x, y)`（先 `getBoundingClientRect()` 获取坐标）。XHS 使用 React，`el.click()` via `page.evaluate()` 不触发 React 事件处理器
- **页面复用**：必须复用已有 Chrome 标签页（`browser.pages()` 取已有页），`browser.newPage()` 创建的页面不共享 session/cookies
- **定时发布 toggle**：用 `page.mouse.click()` 点击坐标
- **定时 input**：需用 `nativeInputValueSetter` 绕过响应式
- **长图文**：必须先点"一键排版"选模板，"下一步"按钮才会出现；模板需等 10-15s 加载
- **"内容设置"/"更多设置"**：默认折叠，必须先点"展开"再操作内部元素
- **变量 scope**：传入 `page.evaluate()` 的变量必须在调用之外定义

---

# Part B: Repurpose（可选）

**仅在用户明确要求优化/适配时使用。** 不要主动触发。

包含视频格式适配（转码/竖屏转换）、封面生成（截帧/AI/用户提供）、文案优化（标题/正文/标签写法技巧）。

长图文有 3 层标题体系：title（悬念 <=64字）、postTitle（结论 10-20字）、postDescription（背景 <=200字）。

详细 repurpose 规则见 `references/repurpose.md`。

---

# JSON 驱动发布架构

**核心原则：内容准备和执行分离。** 每次发布只修改 JSON，脚本不动。

## 发布脚本（固定，puppeteer-core + Chrome CDP）

| 脚本 | 类型 |
|------|------|
| `.claude/skills/infra-browser/scripts/xhs-publish-longarticle.ts` | 长图文发布（读 `XHS_LONGARTICLE_DATA` 环境变量） |
| `.claude/skills/infra-browser/scripts/xhs-publish-image.ts` | 图文发布（读 `XHS_PUBLISH_DATA` 环境变量） |

## JSON 文件命名规范

**每个话题使用独立的 JSON 文件，避免多话题共用同一文件导致覆盖：**

```
tmp/xhs-publish-data-{topic}.json      # 图文
tmp/xhs-longarticle-data-{topic}.json  # 长图文
```

示例：
- `tmp/xhs-publish-data-ai-impact.json`
- `tmp/xhs-publish-data-karpathy-education.json`
- `tmp/xhs-longarticle-data-scribe.json`

**禁止使用不带话题名的默认文件名**（如 `tmp/xhs-publish-data.json`），因为多个会话可能同时准备不同话题的发布数据，会互相覆盖。

## JSON 格式

```json
{
  "images": ["/abs/path/to/img.jpg"],
  "title": "标题（最多20字）",
  "body": "post 描述（显示在图片下方，不是图片内容本身）",
  "tags": ["tag1", "tag2"],
  "aiDeclaration": "",
  "scheduledTime": "2026-03-18 17:00"
}
```

- `body`：post 描述文本，显示在图片/视频下方，简洁扼要（不是图片里的正文）
- `scheduledTime`：空串 = 立即发布；`"YYYY-MM-DD HH:mm"` = 定时发布
- `aiDeclaration`：空串 = 不声明；非空 = 勾选 AI 内容声明

## 执行方式

```bash
# 长图文（puppeteer-core，需 Chrome 开启 Remote Debugging 端口 9222）
XHS_LONGARTICLE_DATA=tmp/xhs-longarticle-data-{topic}.json \
  .claude/skills/infra-browser/node_modules/.bin/tsx .claude/skills/infra-browser/scripts/xhs-publish-longarticle.ts

# 图文（Playwright）
cd ~/.claude/skills/infra-browser
XHS_PUBLISH_DATA=/Users/ayuu/Desktop/zero-code/tmp/xhs-publish-data-{topic}.json \
  node node_modules/tsx/dist/cli.mjs scripts/xhs-publish-image.ts
```

---

# 平台规格速查

| 项目 | 视频 | 图文 | 长图文 |
|------|------|------|--------|
| 发布页标签 | 上传视频（默认） | 上传图文 | 写长文 |
| 素材 | MP4 视频 | 1-18 张图片 | 纯文字 |
| 标题上限 | 20 字 | 20 字 | 64 字 |
| 正文上限 | 1000 字 | 1000 字 | 无明确限制 |
| 正文下限 | 100 字 | 100 字 | — |
| 比例（推荐） | 9:16 | 3:4 | — |
| 分辨率（推荐） | 1080x1920 | 1080x1440 | — |
| 文件大小 | <= 20 GB | <= 32 MB/张 | — |
| 时长上限 | <= 4 小时 | — | — |
| 标签 | <= 10 个 | <= 10 个 | <= 10 个 |
| 封面 | 3:4 推荐 | 首图即封面 | — |
| AI 声明 | 可勾选 | 可勾选 | 可勾选 |

---

# 已验证的选择器（2026-03-11）

完整选择器列表（发布页/草稿箱/发布设置页/长文特有/20个模板）见 `references/selectors.md`。

关键选择器速查：
- 标签切换：`.creator-tab`
- 上传输入：`input.upload-input`
- 标题：`input[placeholder*="标题"]`（视频/图文）/ `textarea[placeholder*="标题"]`（长图文）
- 正文编辑器：`div.tiptap.ProseMirror`
- AI声明：展开"内容设置"→ `.d-select-wrapper.custom-select-44`
- 可见性：展开"更多设置"→ `.permission-card-select`
- 定时发布 toggle：`.post-time-switch-container .d-switch`
- 发布按钮：`page.locator("button").filter({ hasText: /^发布$/ })`（或 `/^定时发布$/`）

---

## 依赖

- infra-browser skill（Playwright，浏览器自动化）
- Chrome 浏览器开启 Remote Debugging（端口 9222）
- ffmpeg / ffprobe（仅 repurpose 模式需要）
- 小红书账号（已在浏览器中登录）

## 参考

- 创作者平台：`https://creator.xiaohongshu.com/publish/publish`
- Postudio 图文发布：`/Users/ayuu/Desktop/postudio/apps/desktop/scripts/test-e2e-day2.ts`
- Postudio 长图文发布：`/Users/ayuu/Desktop/postudio/apps/desktop/scripts/test-article-publish.ts`
- 平台规格文档：`/Users/ayuu/Desktop/postudio/docs/platform-specs/xiaohongshu.md`
- 发布实战记录：`~/.claude/projects/-Users-ayuu-Desktop-zero-code/memory/xhs-publish-findings.md`

---

# 验收测试

每次修改脚本后按清单验收。完整清单见 `references/test-checklist.md`。

核心验收项：
- T1: 图文基础发布 — 脚本 exit 0 + result.json success + 截图确认
- T2: 正文超限 → repurpose 而非截断（exit 1 触发重写）
- T3: 定时发布 — toggle + 时间设置 + 按钮文本变"定时发布"
- T4: 长图文正文 clipboard paste（5000字 <=5秒）
- T5: Bug 回归（bodyText scope / 超限 toast / toggle 选择器）

## references/ 目录

| 文件 | 内容 |
|------|------|
| `references/publish-steps.md` | Steps 1-6 完整代码 + 大文件上传 + 预览页流程 + 风控 |
| `references/selectors.md` | 已验证选择器 + 页面结构 + 长文模板列表 |
| `references/repurpose.md` | 视频适配 + 封面生成 + 文案优化 + 3层标题体系 |
| `references/test-checklist.md` | T1-T5 验收清单 + 运行命令 |

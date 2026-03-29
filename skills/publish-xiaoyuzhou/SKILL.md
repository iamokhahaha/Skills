---
name: publish-xiaoyuzhou
description: "发布播客单集到小宇宙。支持音频上传、时间戳章节、封面设置。触发词：发小宇宙、播客发布、xiaoyuzhou publish、podcast publish、上传播客"
---

# 小宇宙播客发布 Skill

一种模式：**直接发布**（音频已备好）。
一种内容类型：**单集音频**（MP3/M4A）。

## 输入

| 项目 | 必填 | 说明 |
|------|------|------|
| 音频文件 | Yes | MP3 或 M4A，≤ 200MB |
| 单集标题 | Yes | 原样使用 |
| 单集简介 | Yes | 支持时间戳章节格式 |
| 节目（播客） | Yes | 选择已创建的节目 |
| 封面图 | 可选 | 无则使用节目封面 |
| 发布时间 | 可选 | 立即发布 / 定时发布 |
| 草稿模式 | N/A | 小宇宙无草稿功能，只有"立即发布"和"定时发布" |

**不做任何修改** — 不转码、不改标题。直接走浏览器自动化。

## 持久化脚本（固定脚本，不要重新生成）

| 类型 | 脚本路径 | 说明 |
|------|---------|------|
| 单集发布 | `scripts/publish-episode.ts` | 上传音频 + 标题 + show notes + 封面 + 发布 |

### 使用方式

1. 读取脚本文件
2. 修改脚本顶部的 `POST` 对象（podcastId 默认"玛莎"）
3. 运行:

```bash
npx tsx ~/.claude/skills/publish-xiaoyuzhou/scripts/publish-episode.ts
```

4. 结果输出到 `tmp/xiaoyuzhou-publish-result.json`

### 加固特性

- **多选择器降级**: 音频上传尝试 4 种选择器 + filechooser 降级
- **clipboard paste**: show notes 用 ClipboardEvent 保持时间戳格式
- **封面 filechooser**: 点击文字触发 filechooser（不是 input[type=file]）
- **实名认证检测**: 检测"需完成主体认证"提示并报告
- **URL 跳转检测**: 成功后检查跳转到 contents-management
- **截图诊断**: 关键步骤截图

> **重要**: 不要重新生成此脚本！如果遇到 bug，直接修改脚本文件本身。

---

## 平台规格速查

| 项目 | 说明 |
|------|------|
| 平台 URL | `podcaster.xiaoyuzhoufm.com`（创作者后台） |
| 公开 URL | `www.xiaoyuzhoufm.com/episode/XXXXX` |
| 音频格式 | MP3, M4A |
| 文件大小 | ≤ 200MB（建议） |
| 标题 | 单集标题 |
| 简介 | 支持时间戳章节（`MM:SS 章节名`） |
| 封面 | 可选，不传则使用节目封面 |
| 发布时间 | 立即发布 / 定时发布 |
| 登录方式 | 手机号+验证码 / 微信扫码 |
| 节目管理 | 需先创建节目（播客），在节目下发布单集 |

### 关键选择器（速查）

- 标题输入：`input[placeholder*="标题"]`
- Show Notes：`.ProseMirror` 或 `[contenteditable="true"]`
- 音频上传：`input[type="file"][accept="audio/*"]`（hidden, id="upload"）
- 封面上传：点击"点击上传封面"触发 `filechooser`，裁剪确认
- 发布按钮：`text=创建`（蓝色按钮）
- 无草稿按钮

> 完整选择器列表和验收记录见 [`references/selectors.md`](references/selectors.md)

### 关键约束

- 首次发布需**实名认证**（主体认证）
- 封面上传用 `waitForEvent('filechooser')` 而非 `input[type=file]`
- 封面上传后弹裁剪对话框，需点击"裁剪"确认
- 创建成功后跳转到 `/contents-management/episodes?isFromCreate=true`
- 音频上传后显示"转码中"，转码完成后才可收听

### 风控注意

- 操作间 `waitForTimeout(1000-2000)` 随机延迟
- `keyboard.type({ delay: 8-15 })` 模拟真人速度
- 遇验证码 → 截图通知用户手动处理

---

## 发布流程（详细步骤）

详细的 10 步发布流程代码（登录检查、元素发现、节目选择、音频上传、标题简介填写、封面上传、定时设置、截图确认、发布、获取URL）见：

> [`references/publish-flow.md`](references/publish-flow.md)

---

## 依赖

- infra-browser skill（Playwright 浏览器自动化）
- 小宇宙创作者账号（已创建节目）

## 参考

- 小宇宙创作者后台：`https://podcaster.xiaoyuzhoufm.com/`
- 小宇宙公开页：`https://www.xiaoyuzhou.com/`

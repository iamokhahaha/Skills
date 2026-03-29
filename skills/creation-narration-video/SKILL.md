---
name: creation-narration-video
description: "文章转旁白视频。将长文/散文转为带旁白、配图、字幕、转场的完整视频。基于 Remotion + MiniMax TTS + OpenRouter/Gemini + ElevenLabs STT。触发词：做视频、文章转视频、旁白视频、narration video"
---

# narration-video

> 长文 → 分幕脚本 → TTS 语音 → AI 配图 → STT 时间轴 → Remotion 合成 → 成片

将一篇文章/散文转化为完整的旁白配图视频，含字幕、幕间转场、引用文字叠加、封面图。

## 工作流总览

```
1. 脚本拆分       文章 → 分幕旁白 + 每幕分镜描述（图像 prompt）
        ↓
2. TTS 音频  ──┐
               ├── 并行执行，互不依赖
3. AI 配图   ──┘
        ↓
4. STT 时间轴    ElevenLabs Scribe → 逐字时间戳 → 图像锚点对齐（依赖音频完成）
        ↓
5. Remotion      timing.ts 配置 → Ken Burns + 转场 + 字幕 + 引用 → 预览
        ↓
6. 渲染          MP4 成片（首帧=封面）+ 多比例封面 PNG
```

## Phase 1: 脚本拆分

### 输入
- 一篇 Markdown 长文（2000-8000 字）
- **目标时长：8-10 分钟**（~2800-3500 字旁白，按 5.9 字/秒估算）
- 如原文过长，需在拆分阶段精简/删减至目标字数范围内

### 输出
- 分幕旁白文本（每幕 200-800 字，建议 6-10 幕）
- 每幕的分镜列表，每个分镜含：
  - `id`: 场景编号+关键词，如 `S01_monastery`
  - `prompt`: Gemini 图像生成提示词（英文，含风格描述）
  - `anchor`: 旁白中的锚点文本（用于 STT 时间对齐）

### 角色卡（Character Sheet）

人物叙事类视频必须定义角色卡，确保角色在所有画面中外貌一致。

**角色卡内容：** 性别、年龄、体型、发型/发色、面部特征、标志性服装、辨识特征

**使用规则：**
1. 角色卡描述附加到**每一个**含人物的图像 prompt 中
2. 大部分分镜（70%+）应包含主角
3. 纯隐喻/概念镜头可不含人物
4. 多角色分别定义角色卡
5. 特写镜头也要保持与角色卡一致的年龄/肤色特征

### 分镜数量估算

**目标：平均每张图 ~6 秒**（5-7 秒区间）。

**估算公式：**
1. 语速校准：~5.9 字/秒
2. `预估时长 = 总旁白字数 / 5.9`
3. `所需分镜数 = 预估时长 / 6`
4. 每幕分镜数 = 该幕字数占比 x 总分镜数

### 要点
- 幕的划分按叙事节奏，每幕一个情绪/主题
- 锚点取该分镜对应段落的前几个字（4-8 字），确保在全文中唯一
- 图像 prompt 统一风格描述 + 角色卡 = 每个 prompt 的固定部分

## Phase 2+3: TTS 音频 & AI 配图（并行）

> Phase 2 和 Phase 3 互不依赖，应同时启动。Phase 4 的 STT 依赖音频完成，但不依赖图像。

**批量生成前必须先确认：** TTS 先试 3-5 个 voice_id 让用户选择；配图先生 3-5 张样本确认画风。

- **TTS**: MiniMax Speech-02-HD，每幕一个 MP3 → `public/audio/`
- **配图**: OpenRouter + Gemini 3 Pro，并发 5 张，1920x1080 → `public/images/scenes/`

> 详细 API 代码和参数见 [`references/tts-and-imagegen.md`](references/tts-and-imagegen.md)

## Phase 4: STT 时间轴对齐

用 ElevenLabs Scribe STT 获取逐字时间戳 → 校对同音字 → 锚点匹配图片切换时间。

**关键脚本：**
- `scripts/stt_timing.py` — STT + 时间轴生成
- `scripts/proofread_stt.py` — 用原文纠正 STT 同音字错误（difflib 对齐）

**输出：** `stt_raw.json` → `stt_corrected.json` → `timeline.json`

**注意：** STT 时间是相对于单个音频文件的，需加上 act 偏移量得到绝对时间。

> 详细 API、校对算法、锚点匹配逻辑见 [`references/stt-and-subtitles.md`](references/stt-and-subtitles.md)

## Phase 5: Remotion 项目

### 核心文件
- `src/lib/timing.ts` — 所有时间计算（偏移、转场、音频段落）
- `src/components/ScribeVideo.tsx` — 主组合组件
- `src/components/KenBurnsImage.tsx` — Ken Burns 特效（zoom-in/out, pan, static）
- `src/components/ActTransition.tsx` — 幕间转场（黑幕+金色文字）
- `src/components/SubtitleOverlay.tsx` — 底部字幕
- `src/components/QuoteOverlay.tsx` — 引用文字叠加
- `src/components/CoverImage.tsx` — 封面图（导出 16:9 / 4:3 / 3:4 三个比例）

### timing.ts 关键导出
`FPS`, `WIDTH`, `HEIGHT`, `COVER_DURATION_SEC`, `TIMELINE`, `AUDIO_SEGMENTS`, `TRANSITIONS`, `QUOTE_OVERLAYS`, `TOTAL_FRAMES`, `getKenBurns(id)`

### 时间偏移核心逻辑
插入转场和封面后，后续所有音频/图像必须同步后移：
1. 封面静帧 → 基础偏移 `COVER_DURATION_SEC`（推荐 2 秒）
2. 幕间转场 → 累加偏移 `actCumulativeOffset`
3. 所有绝对时间 = 原始时间 + 封面偏移 + 转场累加偏移

### 字幕生成: `scripts/gen_subtitles.py`
从 `stt_corrected.json` 生成 `subtitles.json`。三步：Tokenize → Split（~14字/段） → Post-process（合并过短段 + 英文术语修复）。

> 详细组件参数、转场规则、字幕算法见 [`references/remotion-components.md`](references/remotion-components.md) 和 [`references/stt-and-subtitles.md`](references/stt-and-subtitles.md)

## Phase 6: 预览与渲染

### 预览
```bash
npx remotion studio src/index.ts
```

### 验证清单
- [ ] 转场时间点：黑幕文字出现 → 消失 → 下一幕音频无缝衔接
- [ ] 字幕：断句自然、无 STT artifact
- [ ] 引用文字：与旁白同步、不被字幕遮挡
- [ ] Ken Burns：画面缓慢运动，图片间有交叉淡入淡出
- [ ] 首尾：片头标题渐入渐出、最后一张图不提前淡出

### 渲染成片

```bash
# 视频（首帧已包含封面图）
npx remotion render src/index.ts ScribeVideo output/video.mp4 --codec h264

# 多比例封面图
npx remotion still src/index.ts CoverImage output/cover-16x9.png
npx remotion still src/index.ts CoverImage43 output/cover-4x3.png
npx remotion still src/index.ts CoverImage34 output/cover-3x4.png
```

### 最终产出物

| 产出 | 说明 |
|------|------|
| **视频 MP4** | 1920x1080, H.264, 首帧=封面图，含旁白+字幕+转场+引用 |
| **cover-16x9.png** | 1920x1080, 原始封面 |
| **cover-4x3.png** | 1440x1080, B站首页/视频号分享卡片 |
| **cover-3x4.png** | 1080x1440, 小红书/视频号个人主页 |
| **封面文案** | 标题(2-6字) + 帖子标题(一句话概括) + 内容介绍(150-250字) |
| **视频简介** | 150-250 字，概述故事+悬念 |

> 封面设计规范（文案结构、视觉布局、安全区域、裁切比例）见 [`references/cover-design.md`](references/cover-design.md)

## API Key 配置

| 变量 | 用途 |
|------|------|
| `MINIMAX_API_KEY` | MiniMax TTS |
| `MINIMAX_GROUP_ID` | MiniMax 分组 ID |
| `OPENROUTER_API_KEY` | OpenRouter（调用 Gemini 图像生成） |
| `ELEVENLABS_API_KEY` | ElevenLabs STT |

## 依赖

- Node.js 18+, npm
- Python 3.10+
- Remotion 4.x（`@remotion/cli`, `@remotion/google-fonts`, `remotion`, `react`, `dotenv`）
- Chrome Headless Shell（Remotion 自动下载）
- ffprobe（可选，检查音频时长）

## 详细参考文档

| 文件 | 内容 |
|------|------|
| [`references/remotion-components.md`](references/remotion-components.md) | Remotion 项目结构、timing.ts 详解、组件参数与规格 |
| [`references/tts-and-imagegen.md`](references/tts-and-imagegen.md) | TTS API 调用、配图生成代码、并发策略 |
| [`references/stt-and-subtitles.md`](references/stt-and-subtitles.md) | STT API、校对算法、锚点匹配、字幕分段逻辑 |
| [`references/cover-design.md`](references/cover-design.md) | 封面文案结构、视觉布局、安全区域、平台裁切比例 |

# Remotion 项目搭建与组件详解

> 从 SKILL.md 提取的详细 Remotion 配置、组件规格、时间计算说明。

## 项目初始化

```bash
npx create-video@latest --template blank my-video
cd my-video
npm install @remotion/google-fonts remotion @remotion/cli
```

## 核心文件结构

```
src/
├── index.ts              # Remotion 入口
├── Root.tsx              # Composition 注册
├── lib/
│   ├── timing.ts         # ★ 核心：所有时间计算
│   ├── timeline.json     # 图像时间轴（Phase 4 生成）
│   ├── stt_raw.json      # STT 原始数据
│   ├── stt_corrected.json # STT 校对后数据（Phase 4b 生成）
│   └── subtitles.json    # 字幕分段（Phase 5c 生成）
├── components/
│   ├── ScribeVideo.tsx   # 主视频组件
│   ├── KenBurnsImage.tsx # Ken Burns 特效图片
│   ├── ActTransition.tsx # 幕间转场
│   ├── QuoteOverlay.tsx  # 引用文字叠加
│   ├── SubtitleOverlay.tsx # 字幕
│   └── CoverImage.tsx    # 封面图组件（导出 CoverImage/CoverImage43/CoverImage34）
scripts/
├── stt_timing.py         # STT + 时间轴生成
├── proofread_stt.py      # STT 校对（用原文纠正同音字）
└── gen_subtitles.py      # 字幕分段生成
public/
├── audio/                # act1.mp3 ~ actN.mp3
└── images/               # S01_xxx.jpg ~ S49_xxx.jpg + cover-base.jpg (封面底图)
```

## timing.ts — 时间轴核心

这是最关键的文件，处理所有时间偏移计算。

### 核心概念：幕间转场时间偏移

插入转场后，后续所有音频和图像必须同步后移：

```
原始: act1[0-76s] act2[76-131s] act3[131-200s] ...
插入: act1 act2 [转场2.5s] act3 act4 [转场2.5s] act5 ...
偏移: act1 +0s, act2 +0s, act3 +2.5s, act4 +2.5s, act5 +5s, ...
```

### timing.ts 必须导出

- `FPS`, `WIDTH`, `HEIGHT` — 视频参数（推荐 30fps, 1920x1080）
- `COVER_DURATION_SEC` — 封面静帧时长（推荐 2 秒）
- `COVER_DURATION_FRAMES` — `COVER_DURATION_SEC * FPS`
- `TIMELINE` — 图像时间轴（偏移后）
- `AUDIO_SEGMENTS` — 音频段落（偏移后）
- `TRANSITIONS` — 转场绝对时间
- `QUOTE_OVERLAYS` — 引用文字绝对时间
- `TOTAL_FRAMES`, `TOTAL_DURATION_SEC`
- `getKenBurns(id)` — 每张图的 Ken Burns 方向

### 时间偏移计算流程

1. 定义 `COVER_DURATION_SEC`（封面静帧时长，推荐 2 秒）
2. 定义 `ACT_TRANSITIONS[]`（afterAct, durationSec, text）
3. 遍历 acts 累加偏移量 → `actCumulativeOffset` map
4. **所有绝对时间加上 `COVER_DURATION_SEC` 基础偏移**
5. 音频 startSec = COVER_DURATION_SEC + rawOffset + actCumulativeOffset
6. 图像时间轴 startSec/endSec += COVER_DURATION_SEC + actCumulativeOffset[entry.act]
7. 引用文字的原始时间 += COVER_DURATION_SEC + actCumulativeOffset[quote.act]
8. `TOTAL_DURATION_SEC` = COVER_DURATION_SEC + 所有内容时长

## 组件详解

### KenBurnsImage — 对静态图片做缩放/平移动效

```tsx
// 推荐参数
const ZOOM_RANGE = 0.12;  // 12% 缩放（0.08 太平淡，0.15 偏大）
const PAN_RANGE = 8;      // 8% 平移（5 移动感不足，10 偏快）

// 类型: zoom-in | zoom-out | pan-left | pan-right | pan-up | static
// static 基础 scale: 1.03（微微放大避免黑边，但仍有轻微呼吸感）
```

每张图的 Ken Burns 方向在 `timing.ts` 的 `KB_MAP` 中配置，建议：
- 特写/细节：`zoom-in`（最常用）
- 全景/建筑：`zoom-out`
- 横向场景：`pan-left` / `pan-right`
- 情绪静止点：`static`

### ActTransition — 幕间转场（黑幕 + 居中文字）

转场插入在指定幕之后，推送后续所有音频/图像时间。配置在 `timing.ts` 的 `ACT_TRANSITIONS[]`：

```ts
{ afterAct: "act2", durationSec: 2.5, text: "五个阶段" },
{ afterAct: "act7", durationSec: 4.0, text: "尾声：给571年后的一封信", isSpecial: true },
```

转场规则：
- **普通转场**：2-3 秒，黑底 + 金色文字 (#d4a574)，字号 42px
- **特殊转场** (`isSpecial: true`)：3-5 秒，字号 56px，加上下装饰线
- **文字内容**：短句、承上启下，不加序号（"五个阶段" 而非 "三、五个阶段"）
- **渐入渐出**：各 0.8 秒 `interpolate` 控制 opacity
- 在 ScribeVideo 中用 `<Sequence from={startFrame} durationInFrames={durFrames}>` 渲染

### QuoteOverlay — 画面上叠加引用文字

- 位置：`top: 55%`，不要和底部字幕冲突
- 半透明黑底药丸背景 + 金色文字
- 渐入渐出 0.5s
- **⚠️ 短时长防护**：当 quote 的 durationSec < 1s 时，`totalFrames - FADE_FRAMES` 可能 ≤ `FADE_FRAMES`，导致 `interpolate` 的 inputRange 不递增而崩溃。必须用 `Math.min(FADE_FRAMES, Math.floor(totalFrames / 2))` 限制渐变帧数：

```tsx
const fadeDur = Math.min(FADE_FRAMES, Math.floor(totalFrames / 2));
const opacity = fadeDur > 0
  ? interpolate(frame, [0, fadeDur, totalFrames - fadeDur, totalFrames], [0, 1, 1, 0], ...)
  : 1;
```

### SubtitleOverlay — 底部字幕

- 读取 `subtitles.json`，按 currentSec 查找当前字幕
- 底部居中，半透明黑背景圆角框
- 字号 44px+，白色
- **⚠️ 转场偏移**：`subtitles.json` 的时间是原始音频的连续时间（不含封面和转场偏移）。在视频中查找当前字幕时，必须将视频时间转换回原始音频时间，减去封面偏移和所有已经过的转场偏移。**不能**仅减去 `COVER_DURATION_SEC`，否则转场后的字幕会提前。推荐在 `timing.ts` 导出 `videoSecToRawAudioSec(videoSec)` 函数：

```tsx
// timing.ts
export function videoSecToRawAudioSec(videoSec: number): number {
  let rawSec = videoSec - COVER_DURATION_SEC;
  for (const t of TRANSITIONS) {
    if (videoSec >= t.startSec + t.durationSec) rawSec -= t.durationSec;
    else if (videoSec >= t.startSec) return -1; // inside transition, no subtitle
  }
  return rawSec;
}

// SubtitleOverlay.tsx
const rawAudioSec = videoSecToRawAudioSec(frame / FPS);
if (rawAudioSec < 0) return null;
const active = subtitles.find(s => rawAudioSec >= s.startSec && rawAudioSec < s.endSec);
```

### CoverSequence — 封面首帧序列

视频开头插入封面静帧，确保各平台自动提取首帧时得到设计好的封面图。

```tsx
// 在 ScribeVideo 最前面插入
<Sequence from={0} durationInFrames={COVER_DURATION_FRAMES}>
  <CoverImage />
</Sequence>
// 后续所有内容从 COVER_DURATION_FRAMES 开始
```

- 时长：**2-3 秒**（推荐 2 秒 = 60 帧 @30fps）
- CoverImage 内容：Gemini 底图 + 标题叠加（复用现有 `CoverImage.tsx`）
- 封面结束后渐黑（0.5s）过渡到第一幕
- `COVER_DURATION_FRAMES` 会影响所有后续时间偏移，需在 `timing.ts` 中统一处理

### ScribeVideo — 主组合组件

依次渲染：Audio Sequences → Image Sequences（带 crossfade）→ Transitions → QuoteOverlays → SubtitleOverlay → Title Overlay（片头 2-3 秒）

#### Crossfade 实现（关键）

图片间的交叉淡入淡出通过 Sequence 延长 + opacity 计算实现。**fadeOut 必须在延长部分才开始**，否则会出现黑闪：

```tsx
const CROSSFADE_FRAMES = 15; // 0.5s

// 每张图的 Sequence 延长 CROSSFADE_FRAMES，与下一张重叠
<Sequence from={startFrame} durationInFrames={durationFrames + CROSSFADE_FRAMES}>

// ✅ 正确：fadeOut 从 durationFrames 开始（延长部分）
const fadeIn = i === 0 ? 1 : interpolate(
  localFrame, [0, CROSSFADE_FRAMES], [0, 1],
  { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
);
const fadeOut = i === lastIndex ? 1 : interpolate(
  localFrame, [durationFrames, durationFrames + CROSSFADE_FRAMES], [1, 0],
  { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
);
const opacity = Math.min(fadeIn, fadeOut);

// ❌ 错误：fadeOut 在 durationFrames 前就结束 → 图片已消失但下一张还没出现 = 黑闪
// [durationFrames - CROSSFADE_FRAMES, durationFrames] → 不要这样写
```

#### Quote Overlay 时间坐标

RAW_QUOTES 的 `startSec`/`endSec` 必须使用**累计原始音频时间**（即 timeline.json 中的值），不是每幕内部的相对时间。代码会再加上 `actCumulativeOffset` 得到最终显示时间。

```ts
// ✅ 正确：从 timeline.json 读取累计时间
{ imageId: "S40_message", act: "act4", startSec: 223.92, endSec: 224.42, text: "..." }

// ❌ 错误：使用幕内相对时间（65.66 是 act4 内部的秒数）
{ imageId: "S40_message", act: "act4", startSec: 65.66, endSec: 67.86, text: "..." }
```

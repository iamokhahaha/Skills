# Part B: Repurpose（可选）

**仅在用户明确要求优化/适配时使用。** 不要主动触发。

## B1. 视频格式适配

```bash
ffprobe -v quiet -print_format json -show_format -show_streams "$VIDEO_PATH"
```

| 问题 | 处理 |
|------|------|
| 非 MP4 | `ffmpeg -i in -c:v libx264 -crf 23 -c:a aac -movflags +faststart out.mp4` |
| 超 50MB（平台实际支持 20GB，但上传慢） | `ffmpeg -i in -c:v libx264 -crf 28 -preset medium -c:a aac -b:a 128k -movflags +faststart out.mp4` |
| 超 4 小时 | 提醒用户裁剪 |
| 横屏想转竖屏 | 仅用户要求时：模糊背景填充 |

```bash
# 横屏转竖屏（模糊背景）
ffmpeg -i "$INPUT" \
  -vf "split[original][copy];[copy]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=20[bg];[bg][original]overlay=(W-w)/2:(H-h)/2" \
  -c:v libx264 -crf 23 -c:a aac "$OUTPUT.mp4"
```

## B2. 封面生成

- **从视频截帧：** `ffmpeg -i video -ss 3 -vframes 1 -q:v 2 cover.jpg` → 裁切 3:4
- **AI 生成（Gemini）：** 视频主题 + 3:4 竖版 + 大字标题 + 鲜艳色调
- **用户提供：** 校验比例后裁切到 3:4（1242x1660）

## B3. 文案优化

### 标题（视频/图文 <= 20 字，长图文 <= 64 字）

- 数字开头：「3个方法让你...」
- 情绪词：「绝了」「后悔没早知道」
- 1-2 个 emoji
- 禁止极限词、谐音字

### 长图文 3 层标题体系

长图文有 3 个不同用途的标题字段：

| 字段 | 位置 | 字数 | 目的 |
|------|------|------|------|
| title | 文章编辑器内 H1 | <=64字 | **制造悬念/好奇心** — 吸引用户点进来读 |
| postTitle | 发布设置页"帖子标题" | 10-20字 | **简述答案/结论** — 让人一眼知道在说啥 |
| postDescription | 发布设置页"帖子简介" | <=200字 | **创作背景** — 为什么写、核心发现、适合谁看 |

**title 写法技巧**（制造悬念）：

- 数字钩子：「我分析了500条评论，发现一个残酷真相」
- 反转/悬念：「学了4年CS，毕业才发现全白学了」
- 提问式：「为什么AI越发展，程序员越焦虑？」
- 情绪共鸣：「看完这篇，我沉默了」

**postTitle 写法**：直接给出核心结论，如「AI时代程序员转型的5条出路」

**postDescription 写法**：<=200 字，创作动机 + 核心发现 + 适合谁看

### 正文（100-1000 字）

- 钩子开头 + 分段清晰 + 互动引导
- AI 内容需声明（2025 新规）

### 标签（<= 10 个）

- 核心词 2-3 + 热门词 2-3 + 长尾词 2-3 + 场景词 1-2

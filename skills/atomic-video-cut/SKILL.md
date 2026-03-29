---
name: atomic-video-cut
description: "视频剪辑工具。支持口误识别、静音检测、语气词处理、内容精简、字幕生成、时间轴、视频裁切/拼接/转场。子命令：videocut:安装、videocut:剪口播、videocut:精简、videocut:剪辑、videocut:字幕、videocut:时间轴、videocut:自更新。触发词：剪辑视频、video cut、剪视频、裁切视频"
---

# atomic-video-cut

> 视频剪辑 Agent：口误清理、内容精简、裁切拼接、转场、字幕

视频剪辑 skill，用 Claude Code 做视频剪辑 Agent。支持两大模式：**口播清理**（转录→口误/静音识别→剪辑）和**通用剪辑**（裁切、拼接、转场）。

## 触发词

- 剪辑视频、video cut、剪视频
- 裁切视频、拼接视频、加转场
- 剪口播、去口误、去静音

## 子命令

| 命令 | 功能 |
|------|------|
| `/videocut:安装` | 环境准备、模型下载 |
| `/videocut:剪口播` | 转录 + 口误/静音识别 → 审查稿 |
| `/videocut:精简` | 内容分析 + 删减建议 |
| `/videocut:剪辑` | 执行 FFmpeg 剪辑 |
| `/videocut:字幕` | Whisper 字幕生成与烧录 |
| `/videocut:时间轴` | 话题识别 + 底部导航条烧录 |
| `/videocut:自更新` | 从错误中学习，更新规则 |

## 口播清理工作流

```
安装（首次）
    ↓
剪口播 → 转录 + 口误/静音/语气词识别 → 审查稿
    ↓
精简（可选）→ 内容分析 → 删减建议
    ↓
【用户确认删除清单】
    ↓
剪辑 → 执行删除 → 重新审查 → 循环直到零口误
    ↓
字幕 → 词典纠错 → 烧录
    ↓
时间轴（可选）→ 话题识别 → 底部导航条
    ↓
自更新（发现问题时）
```

## 通用剪辑操作

### 裁切（截取片段）

```bash
# 精确裁切（需重编码）
ffmpeg -i input.mp4 -ss 00:01:00 -to 00:03:30 \
  -c:v libx264 -crf 23 -c:a aac output.mp4

# 快速裁切（关键帧对齐，可能不精确）
ffmpeg -ss 00:01:00 -i input.mp4 -to 00:02:30 \
  -c copy output.mp4
```

### 拼接（多段合并）

**方法 A: filter_complex（推荐，确保音画同步）**

```bash
ffmpeg -i part1.mp4 -i part2.mp4 -i part3.mp4 \
  -filter_complex "
    [0:v]setpts=PTS-STARTPTS[v0];[0:a]asetpts=PTS-STARTPTS[a0];
    [1:v]setpts=PTS-STARTPTS[v1];[1:a]asetpts=PTS-STARTPTS[a1];
    [2:v]setpts=PTS-STARTPTS[v2];[2:a]asetpts=PTS-STARTPTS[a2];
    [v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[outv][outa]
  " \
  -map "[outv]" -map "[outa]" \
  -c:v libx264 -crf 23 -c:a aac \
  output.mp4
```

**方法 B: concat demuxer（快速但可能不同步，仅编码一致时用）**

```bash
# filelist.txt:
# file 'part1.mp4'
# file 'part2.mp4'
# file 'part3.mp4'

ffmpeg -f concat -safe 0 -i filelist.txt -c copy output.mp4
```

### 转场效果

```bash
# 交叉溶解（crossfade）— 两个视频间 1 秒转场
ffmpeg -i part1.mp4 -i part2.mp4 \
  -filter_complex "
    [0:v]trim=0:10,setpts=PTS-STARTPTS[v0];
    [1:v]trim=0:10,setpts=PTS-STARTPTS[v1];
    [v0][v1]xfade=transition=fade:duration=1:offset=9[outv];
    [0:a]atrim=0:10,asetpts=PTS-STARTPTS[a0];
    [1:a]atrim=0:10,asetpts=PTS-STARTPTS[a1];
    [a0][a1]acrossfade=d=1[outa]
  " \
  -map "[outv]" -map "[outa]" output.mp4
```

**xfade 转场类型**:

| 转场 | 说明 |
|------|------|
| `fade` | 淡入淡出（最常用） |
| `wipeleft` | 左划 |
| `wiperight` | 右划 |
| `wipeup` | 上划 |
| `wipedown` | 下划 |
| `slideleft` | 左滑 |
| `slideright` | 右滑 |
| `circlecrop` | 圆形展开 |
| `dissolve` | 溶解 |
| `pixelize` | 像素化 |
| `diagtl` | 对角线（左上） |

### 速度调整

```bash
# 2 倍速
ffmpeg -i input.mp4 \
  -filter_complex "[0:v]setpts=0.5*PTS[v];[0:a]atempo=2.0[a]" \
  -map "[v]" -map "[a]" output.mp4

# 0.5 倍慢放
ffmpeg -i input.mp4 \
  -filter_complex "[0:v]setpts=2.0*PTS[v];[0:a]atempo=0.5[a]" \
  -map "[v]" -map "[a]" output.mp4
```

### 画幅变换

```bash
# 横屏转竖屏（模糊背景填充）
ffmpeg -i input.mp4 \
  -vf "split[original][copy];[copy]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=20[bg];[bg][original]overlay=(W-w)/2:(H-h)/2" \
  -c:v libx264 -crf 23 -c:a aac output_vertical.mp4

# 竖屏转横屏（模糊背景填充）
ffmpeg -i input.mp4 \
  -vf "split[original][copy];[copy]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,gblur=sigma=20[bg];[bg][original]overlay=(W-w)/2:(H-h)/2" \
  -c:v libx264 -crf 23 -c:a aac output_horizontal.mp4
```

## FFmpeg 剪辑最佳实践

### 关键规则：确保音画同步

**必须使用 filter_complex + trim/atrim**：

```bash
ffmpeg -y -i input.mp4 \
  -filter_complex_script filter.txt \
  -map "[outv]" -map "[outa]" \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 128k \
  -async 1 \
  output.mp4
```

### filter.txt 格式

视频和音频必须成对处理：

```
[0:v]trim=start=0:end=1.36,setpts=PTS-STARTPTS[v0];
[0:a]atrim=start=0:end=1.36,asetpts=PTS-STARTPTS[a0];
[0:v]trim=start=2.54:end=10.5,setpts=PTS-STARTPTS[v1];
[0:a]atrim=start=2.54:end=10.5,asetpts=PTS-STARTPTS[a1];
[v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]
```

### 优化：合并相邻片段

间隔 <0.5秒的片段应合并：

```python
merged = []
for start, end in segments:
    if merged and start - merged[-1][1] < 0.5:
        merged[-1] = (merged[-1][0], end)
    else:
        merged.append((start, end))
```

## 依赖

- **FFmpeg** — 核心剪辑工具
- **Python 3.8+** — 脚本运行
- **FunASR** — 口误识别（口播清理模式）
- **Whisper** — 字幕生成

## 踩坑记录

- **音画不同步**: concat demuxer 分开处理音视频导致。用 filter_complex trim+atrim 同时处理
- **时长元数据错误**: 导出后显示原始时长。filter_complex 方法自动修正
- **语气词删除边界不精确**: 用 `前一字.end` 到 `后一字.start` 而不是语气词自身时间戳
- **语气词+静音要一起删**: `A [静音] 语气词 B` 删整段 (A.end - B.start)
- **时间戳驱动**: 直接从审查稿 TodoList 解析时间戳，不要重新搜索文本

## 与其他 skill 的关系

- **atomic-audio-extract** 提取音频 → 本 skill 转录分析
- **atomic-subtitle-gen** / **media-subtitle-burn** — 字幕子功能已内置，也可独立使用
- **media:video-compose** 侧重合成叠加，本 skill 侧重剪辑删减
- **media:format-adapt** 可调用本 skill 做画幅变换

## 已有子命令 SKILL.md

详细子命令文档位于 `~/.claude/skills/atomic-video-cut/` 下：
- `安装/SKILL.md` — 环境准备
- `剪口播/SKILL.md` — 转录+口误识别
- `精简/SKILL.md` — 内容精简
- `剪辑/SKILL.md` — FFmpeg 执行
- `字幕/SKILL.md` — 字幕生成烧录
- `时间轴/SKILL.md` — 话题导航条
- `自更新/SKILL.md` — 规则自更新

## 测试用例

### 测试 1: 视频裁切
```
输入: 10 分钟视频，截取 2:00-5:30

预期: 3.5 分钟视频，音画同步
```

### 测试 2: 带转场拼接
```
输入: 3 个视频片段，每段间 1 秒 fade 转场

预期: 拼接后视频，转场平滑自然
```

### 测试 3: 画幅变换
```
输入: 1920x1080 横屏视频 → 1080x1920 竖屏

预期: 竖屏视频，模糊背景填充上下空间
```

---

## 验收记录

<!-- 测试通过后填写 -->

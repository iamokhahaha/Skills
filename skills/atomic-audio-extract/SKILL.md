---
name: atomic-audio-extract
description: "从视频提取音频或人声分离。ffmpeg 基础提取 + demucs 人声/伴奏分离。触发词：提取音频、audio extract、提取人声、分离人声、视频转音频、extract audio、去伴奏"
---

# atomic-audio-extract

> 视频文件 → ffmpeg 提取音频 / demucs 人声分离

CLI skill。使用 ffmpeg 从视频中提取音频轨道，高级模式使用 demucs 进行人声与背景音分离。

## 触发词

- 提取音频、audio extract
- 提取人声、分离人声、去背景音
- 视频转音频

## 输入

| 项目 | 必填 | 说明 |
|------|------|------|
| input_video | ✅ | 视频文件路径 |
| mode | 可选 | `basic`（默认，直接提取）/ `vocal`（人声分离） |
| format | 可选 | `mp3`（默认）/ `wav` / `aac` / `flac` |
| sample_rate | 可选 | 采样率（默认保持原始，常用 44100 / 16000） |
| output_path | 可选 | 输出路径（默认同目录同名 + 音频后缀） |

## Mode A: 基础提取（ffmpeg）

### 提取完整音频

```bash
# MP3 格式
ffmpeg -i input.mp4 -vn -acodec libmp3lame -ab 192k output.mp3

# WAV 格式（无损，适合后续处理）
ffmpeg -i input.mp4 -vn -acodec pcm_s16le -ar 44100 output.wav

# AAC 格式（小体积）
ffmpeg -i input.mp4 -vn -acodec aac -ab 128k output.aac

# 保持原始编码直接复制（最快，无转码）
ffmpeg -i input.mp4 -vn -acodec copy output.aac
```

### 提取指定时间段

```bash
# 提取 00:01:00 到 00:03:30
ffmpeg -i input.mp4 -vn -ss 00:01:00 -to 00:03:30 -acodec libmp3lame -ab 192k output.mp3
```

### 降采样（用于 STT）

```bash
# 16kHz 单声道（Whisper/FunASR 推荐格式）
ffmpeg -i input.mp4 -vn -ar 16000 -ac 1 -acodec pcm_s16le output.wav
```

### 获取音频信息

```bash
ffprobe -v quiet -print_format json -show_streams -select_streams a input.mp4
# → codec_name, sample_rate, channels, duration, bit_rate
```

## Mode B: 人声分离（demucs）

使用 Meta 的 demucs 模型将音频分离为 vocals / drums / bass / other 四轨。

### 安装

```bash
pip install demucs
# 或
pip install -U demucs torch torchaudio
```

### 使用

```bash
# 先提取音频
ffmpeg -i input.mp4 -vn -acodec pcm_s16le -ar 44100 temp_audio.wav

# demucs 分离
demucs temp_audio.wav -o output_dir/

# 输出目录结构:
# output_dir/htdemucs/temp_audio/
#   ├── vocals.wav    ← 人声
#   ├── drums.wav     ← 鼓点
#   ├── bass.wav      ← 低音
#   └── other.wav     ← 其他（配乐等）
```

### 仅提取人声

```bash
demucs temp_audio.wav -o output_dir/ --two-stems vocals
# 输出: vocals.wav + no_vocals.wav
```

### 模型选择

| 模型 | 质量 | 速度 | 说明 |
|------|------|------|------|
| `htdemucs` | ★★★★ | ★★★★ | 默认，平衡 |
| `htdemucs_ft` | ★★★★★ | ★★★ | 微调版，最高质量 |
| `mdx_extra` | ★★★★ | ★★★★ | MDX 架构 |

```bash
demucs --name htdemucs_ft temp_audio.wav -o output_dir/
```

## 输出

```json
{
  "input": "input.mp4",
  "mode": "basic",
  "output": {
    "audio": "output.mp3",
    "format": "mp3",
    "duration": "5:32",
    "sample_rate": 44100,
    "channels": 2,
    "size_bytes": 5324800
  }
}
```

人声分离模式额外输出：
```json
{
  "mode": "vocal",
  "output": {
    "vocals": "output_dir/htdemucs/audio/vocals.wav",
    "accompaniment": "output_dir/htdemucs/audio/no_vocals.wav"
  }
}
```

## 依赖

- **ffmpeg** — 基础音频提取（必须）
- **ffprobe** — 音频信息查询（必须）
- **demucs** — 人声分离（可选，仅 vocal 模式需要）
- **Python 3.8+** — demucs 运行环境

## 与其他 skill 的关系

- 本 skill 提取音频 → **media:stt** 转文字
- 本 skill 提取音频 → **atomic-subtitle-gen** 生成字幕
- 本 skill 人声分离 → 去除背景音后更好的 STT 效果
- **atomic-video-cut** 剪辑流程中可先提取音频做转录

## 测试用例

### 测试 1: 基础提取
```
输入:
  input_video: "test.mp4"
  format: mp3

预期: 输出同名 .mp3 文件，时长与视频一致
```

### 测试 2: 人声分离
```
输入:
  input_video: "interview.mp4"
  mode: vocal

预期: 输出 vocals.wav（纯人声）+ no_vocals.wav（背景音）
```

---

## 验收记录

<!-- 测试通过后填写 -->

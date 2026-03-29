---
name: atomic-music-search
description: "搜索免版权背景音乐。Pixabay Music API（免费商用）+ YouTube Audio Library（备选）。触发词：搜索音乐、找BGM、music search、背景音乐"
---

# atomic-music-search — 背景音乐搜索

> 关键词/风格 → Pixabay API → 结果列表 → 下载 MP3

## 触发短语
- "搜索音乐" / "找BGM" / "music search" / "背景音乐"

## 输入格式
```json
{
  "keyword": "搜索关键词",
  "mood": "happy | sad | calm | energetic | epic",
  "genre": "pop | classical | electronic | ambient | jazz",
  "min_duration": 30,
  "max_duration": 120,
  "download_path": "可选"
}
```

## Pixabay Music API（主力）

- **API**: `GET https://pixabay.com/api/`
- **Env**: `PIXABAY_API_KEY`
- **License**: 免费商用，无需署名

```bash
curl "https://pixabay.com/api/?key=${PIXABAY_API_KEY}&q=calm+piano&type=music&min_duration=30&max_duration=120&order=popular"
```

响应: `{ total, hits: [{ id, title, tags, duration, audio, downloads, user }] }`

## 下载
```bash
curl -L "${audio_url}" -o "tmp/bgm.mp3"
```

## 输出
```json
{
  "results": [{ "title": "...", "artist": "...", "duration": 65, "download_url": "...", "license": "Pixabay", "tags": [] }],
  "total": 42,
  "downloaded": "tmp/bgm.mp3"
}
```

## 测试用例
1. 搜索 "calm background" 30-60秒 → ≥5条结果
2. 下载第一条 → MP3 有效
3. mood=epic genre=classical → 结果风格匹配

## 验收记录
<\!-- 测试结果记录区 -->

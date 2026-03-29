# TTS 音频 & AI 配图详解

> 从 SKILL.md 提取的 Phase 2+3 详细 API 调用和代码示例。

## 确认步骤（批量生成前必须执行）

**TTS 音频：** 批量生成前，先用同一段旁白文本生成 3-5 个不同 voice_id 的音频片段，让用户试听选择满意的声音后再批量生成。

**AI 配图：** 批量生成前，先生成 3-5 张样本图（选不同场景类型），让用户确认画风满意后再批量生成。避免批量生成后发现风格不对导致全部重做。

## TTS 音频 — MiniMax Speech-02-HD

```bash
curl -s "https://api.minimaxi.chat/v1/t2a_v2" \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "speech-02-hd",
    "text": "旁白文本...",
    "stream": false,
    "voice_setting": {
      "voice_id": "Chinese (Mandarin)_Reliable_Executive",
      "speed": 1.0
    },
    "audio_setting": {
      "sample_rate": 32000,
      "bitrate": 128000,
      "format": "mp3"
    }
  }'
```

### 要点
- 每幕单独生成一个 MP3，命名为 `act1.mp3` ~ `actN.mp3`
- 放到 `public/audio/` 目录
- `speed: 1.0` 适合叙述类；速度影响总时长，后续不可调
- 可用 `voice_id` 有 Executive / Calm / Warm 等风格
- API 返回 hex 编码音频，需要解码：`bytes.fromhex(data["audio_file"])`
- 记录每段音频实际时长（用 ffprobe 或 STT 结果），填入 `ACT_DURATIONS`

## AI 配图 — OpenRouter + Gemini（同步逐张生成）

**通过 OpenRouter 调用 Gemini 图像生成：**

```python
import requests, base64, os, time

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "google/gemini-3-pro-image-preview"

HEADERS = {
    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
    "Content-Type": "application/json",
}

def generate_one(name, prompt, out_dir, retries=3):
    out_path = os.path.join(out_dir, f"{name}.jpg")
    if os.path.exists(out_path) and os.path.getsize(out_path) > 10000:
        return True  # skip existing

    for attempt in range(retries):
        resp = requests.post(URL, headers=HEADERS, json={
            "model": MODEL,
            "messages": [{"role": "user", "content": prompt}],
        })
        if resp.status_code == 429:
            time.sleep(2 ** attempt)
            continue
        data = resp.json()
        msg = data["choices"][0]["message"]
        # 图片在 message.images 字段（OpenRouter 格式）
        for img in msg.get("images", []):
            url = img["image_url"]["url"]  # data:image/png;base64,...
            b64 = url.split(",", 1)[1]
            with open(out_path, "wb") as f:
                f.write(base64.b64decode(b64))
            return True
    return False
```

**并发生成：** 使用 `ThreadPoolExecutor` 并发 5 个请求，显著加快生成速度。每个请求生成 1 张图片。如遇 429 rate limit，单个请求自动 retry + exponential backoff。

### 要点

- 模型：`google/gemini-3-pro-image-preview`（通过 OpenRouter）
- 并发数：5（`ThreadPoolExecutor(max_workers=5)`）
- 图像尺寸：1920x1080（16:9）或接近比例，在 prompt 中明确要求
- 返回 base64 图片，decode 后保存为 JPG
- 放到 `public/images/scenes/` 目录，文件名即分镜 id：`S01_glass_dawn.jpg`
- 已有文件（>10KB）自动跳过，支持断点续传
- 429 时自动 retry + exponential backoff
- 同一视频内图片风格必须统一（在每个 prompt 末尾附加统一的风格描述）

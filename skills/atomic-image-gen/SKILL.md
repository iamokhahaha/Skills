---
name: atomic-image-gen
description: "多模型 AI 生图。优先 OpenRouter + Gemini 3 Pro，也支持 Gemini 2.5 Flash、Seedream 4.5、FLUX 2 Max。触发词：生成图片、AI生图、image gen、画一张图"
---

# atomic-image-gen

> Prompt → AI 生图（多模型选择）→ 保存图片

REST API skill。支持多个图片生成模型，**默认通过 OpenRouter 调用 Gemini 3 Pro**。

## 触发词

- 生成图片、AI生图、image gen
- 画一张图、生成配图、做封面

## 输入

| 项目 | 必填 | 说明 |
|------|------|------|
| prompt | ✅ | 图片描述（英文效果最佳） |
| model | 可选 | `gemini-pro`（默认，OpenRouter）/ `gemini-flash` / `seedream` / `flux` |
| image_size | 可选 | 宽x高 或预设：`landscape_16_9` / `portrait_4_3` / `portrait_9_16` / `square` |
| num_images | 可选 | 生成数量（默认 1，最多 4） |
| output_dir | 可选 | 输出目录（默认当前目录） |
| filename | 可选 | 文件名（默认 `image_{timestamp}.jpg`） |

## 输出

```json
{
  "model": "gemini-flash",
  "images": [
    {
      "path": "/path/to/output.jpg",
      "size_bytes": 204800,
      "width": 1920,
      "height": 1080
    }
  ],
  "cost_estimate": "$0.002",
  "duration_ms": 3200
}
```

## 模型选择指南

| 模型 | Provider | 质量 | 速度 | 文件大小 | 费用 | 适合场景 |
|------|----------|------|------|----------|------|----------|
| **Gemini 3 Pro** | **OpenRouter** | ★★★★★ | ★★★ | ~1.5MB | OpenRouter 按量 | **默认首选**，最终质量、文字海报 |
| Gemini 2.5 Flash | Google 直连 | ★★★ | ★★★★★ | ~200KB | 免费额度 | 快速原型（备选） |
| Seedream 4.5 | ByteDance/fal | ★★★★ | ★★★★★ | ~10MB | fal 按量 | 高分辨率、2K/4K |
| FLUX 2 Max | BFL/fal | ★★★★★ | ★★★ | ~230KB | fal 按量 | 真实感人像、角色一致 |

**自动选择规则**（当 model 未指定时）：
1. **默认 → `gemini-pro`（OpenRouter，质量最高）**
2. 含人物肖像 → `flux`（角色一致性最好）
3. 需要 4K 分辨率 → `seedream`（原生 2K/4K）
4. 明确要求快速/便宜 → `gemini-flash`

## API 调用

### 1. Gemini 3 Pro via OpenRouter（默认首选）

**Env**: `OPENROUTER_API_KEY`

```python
import requests, base64, os

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "google/gemini-3-pro-image-preview"

resp = requests.post(URL, headers={
    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
    "Content-Type": "application/json",
}, json={
    "model": MODEL,
    "messages": [{"role": "user", "content": "Generate an image: A serene mountain landscape at sunset, 16:9"}],
})
data = resp.json()
msg = data["choices"][0]["message"]

# 图片在 message.images 字段（非 content）
for img in msg.get("images", []):
    url = img["image_url"]["url"]  # data:image/png;base64,...
    b64 = url.split(",", 1)[1]
    with open("output.png", "wb") as f:
        f.write(base64.b64decode(b64))
```

### 1b. Gemini 2.5 Flash via Google 直连（备选）

**Env**: `GOOGLE_API_KEY`

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=$GOOGLE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "A serene mountain landscape at sunset, 16:9 aspect ratio"}]}],
    "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}
  }'
```

**Response 解析（Google 直连格式）**:
```python
import base64, json
data = json.loads(response.text)
for part in data["candidates"][0]["content"]["parts"]:
    if "inlineData" in part:
        img_bytes = base64.b64decode(part["inlineData"]["data"])
        with open("output.png", "wb") as f:
            f.write(img_bytes)
```

### 2. Seedream 4.5 (ByteDance via fal.ai)

**Env**: `FAL_KEY`

```bash
curl -s "https://fal.run/fal-ai/bytedance/seedream/v4.5/text-to-image" \
  -H "Authorization: Key $FAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A serene mountain landscape at sunset",
    "image_size": "landscape_16_9",
    "num_images": 1
  }'
```

**Response**: `images[0].url` → 需二次下载：
```bash
curl -o output.jpg "$(echo $RESPONSE | jq -r '.images[0].url')"
```

### 3. FLUX 2 Max (Black Forest Labs via fal.ai)

**Env**: `FAL_KEY`

```bash
curl -s "https://fal.run/fal-ai/flux-2-max" \
  -H "Authorization: Key $FAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A serene mountain landscape at sunset",
    "image_size": {"width": 1920, "height": 1080},
    "num_images": 1
  }'
```

**Response**: 同 Seedream，`images[0].url` 需二次下载。

### fal.ai 异步模式（大批量时推荐）

```bash
# 提交任务
curl -s "https://queue.fal.run/fal-ai/flux-2-max" \
  -H "Authorization: Key $FAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "...", "image_size": {"width": 1920, "height": 1080}}' \
  # → {"request_id": "abc123"}

# 轮询状态
curl -s "https://queue.fal.run/fal-ai/flux-2-max/requests/abc123/status" \
  -H "Authorization: Key $FAL_KEY"
  # → {"status": "COMPLETED"}

# 获取结果
curl -s "https://queue.fal.run/fal-ai/flux-2-max/requests/abc123" \
  -H "Authorization: Key $FAL_KEY"
```

**注意**: 不要混用同步/异步端点，会导致 JSON parse error。

## Node.js Proxy 注意

macOS Node.js fetch 不走系统代理。如需访问 Google API（需翻墙），在脚本顶部添加：

```typescript
import { ProxyAgent, setGlobalDispatcher } from 'undici'
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
if (proxyUrl) setGlobalDispatcher(new ProxyAgent(proxyUrl))
```

## 批量生成模式

用于 `content-scene-breakdown` 输出的分镜配图：

```python
import os, time, json

scenes = json.load(open("scenes.json"))
for scene in scenes["scenes"]:
    for sub in scene.get("sub_scenes", []):
        output_path = f"images/{sub['id']}.jpg"
        if os.path.exists(output_path) and os.path.getsize(output_path) > 10000:
            continue  # 跳过已有文件（断点续传）
        generate_one(sub["id"], sub["prompt"], "images/")
        time.sleep(1)  # 逐张生成，间隔 1 秒避免 429
```

## API Keys

| 变量 | 模型 | 位置 |
|------|------|------|
| `OPENROUTER_API_KEY` | **Gemini 3 Pro（默认）** | 项目 `.env` |
| `GOOGLE_API_KEY` | Gemini Flash（备选直连） | `~/.claude/.env` |
| `FAL_KEY` | Seedream, FLUX | `~/.claude/.env` |

## 与其他 skill 的关系

- **content-scene-breakdown** 输出 image_prompt → 本 skill 生成配图
- **creation-narration-video** Phase 3 使用本 skill
- 本 skill 输出图片 → **media:talking-head** 作为肖像输入
- 本 skill 输出图片 → **publish-xhs** 等发布 skill

## 测试用例

### 测试 1: 单张生成
```
输入:
  prompt: "A 22-year-old Chinese male college student standing at a university gate, cinematic photography"
  model: flux

预期: 1 张高质量人像图片，~230KB
```

### 测试 2: 批量配图
```
输入:
  scenes.json 中 10 个 sub_scenes 的 prompt
  model: gemini-flash

预期: 10 张图片，每张 ~200KB，断点续传跳过已有
```

---

## 验收记录

<!-- 测试通过后填写 -->

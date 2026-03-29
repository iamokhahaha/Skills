---
name: atomic-video-gen
description: "AI 文/图生视频。Google Veo 3.1 直调 + fal.ai Veo 3.1，支持文本描述或图片输入生成短视频。触发词：生成视频、AI生视频、video gen、文生视频、图生视频、generate video、AI视频"
---

# atomic-video-gen

> 文字 prompt / 图片 → Veo 3.1 → 视频片段（4-8秒，含音频）

REST API skill。支持两种调用方式：Google API 直调（免费额度）和 fal.ai（按秒计费）。

## 触发词

- 生成视频、AI生视频、video gen
- 文生视频、图生视频、做个视频片段

## 输入

| 项目 | 必填 | 说明 |
|------|------|------|
| prompt | ✅ | 视频内容/运动描述 |
| mode | 可选 | `text2video`（默认）/ `image2video` / `first-last-frame` |
| image_path | 条件 | image2video 模式必填，参考图片路径（首帧） |
| last_image_path | 条件 | first-last-frame 模式必填，尾帧图片路径 |
| aspect_ratio | 可选 | `16:9`（默认）/ `9:16` / `1:1` |
| resolution | 可选 | `720p`（默认）/ `1080p` / `4k`（仅 fal.ai） |
| duration | 可选 | 视频时长秒数（默认 8，范围 4-8） |
| model | 可选 | `fast`（默认）/ `standard` |
| provider | 可选 | `google`（默认，免费）/ `fal`（按秒收费） |
| output_path | 可选 | 输出路径（默认 `video_{timestamp}.mp4`） |

## Provider 选择指南

| Provider | 费用 | 首帧 | 首尾帧 | 分辨率 | 音频 | 适合场景 |
|----------|------|------|--------|--------|------|----------|
| Google 直调 | 免费额度 | ✅ | ❌ | 720p/1080p | ✅ | 默认首选，省钱 |
| fal.ai | $0.20-0.60/秒 | ✅ | ✅ | 720p/1080p/4K | ✅ | 需要首尾帧控制 |

**自动选择规则**：
1. 需要首尾帧模式 → `fal`（Google 不支持）
2. 其他情况 → `google`（免费）

## 方式一：Google API 直调（推荐，免费额度）

**Env**: `GOOGLE_API_KEY`（或 `GEMINI_API_KEY`）
**已验证项目**: newton-cat（`biz-projects/newton-cat/app/vite.config.ts` L382-567）

### Text-to-Video

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning" \
  -H "x-goog-api-key: $GOOGLE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instances": [{
      "prompt": "A young programmer sitting at a desk, cinematic lighting, slow camera push-in"
    }],
    "parameters": {
      "aspectRatio": "16:9",
      "resolution": "720p",
      "durationSeconds": 8
    }
  }'
```

**Response**: `{"name": "models/veo-3.1-fast-generate-preview/operations/abc123"}`

### Image-to-Video（首帧参考图）

图片必须用 `bytesBase64Encoded`，不能用 `inlineData` 或 `fileUri`。
由于 base64 字符串很大，**必须用脚本提交**（不能直接嵌入 shell 变量，会超出参数长度限制）。

```python
import base64, json, urllib.request, os

api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")

# 读取图片并编码
with open("reference.jpg", "rb") as f:
    img_b64 = base64.b64encode(f.read()).decode("utf-8")

payload = {
    "instances": [{
        "prompt": "Camera slowly pushes in, gentle ambient sounds",
        "image": {
            "bytesBase64Encoded": img_b64,
            "mimeType": "image/jpeg"
        }
    }],
    "parameters": {
        "aspectRatio": "16:9",
        "resolution": "720p",
        "durationSeconds": 8
    }
}

url = f"https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning"
req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"),
    headers={"x-goog-api-key": api_key, "Content-Type": "application/json"}, method="POST")
resp = urllib.request.urlopen(req, timeout=60)
result = json.loads(resp.read().decode())
print("Operation:", result["name"])
```

### 轮询任务状态

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/${OPERATION_NAME}" \
  -H "x-goog-api-key: $GOOGLE_API_KEY"
```

**进行中**: `{"name": "...", "done": false}`
**完成**:
```json
{
  "name": "...",
  "done": true,
  "response": {
    "generateVideoResponse": {
      "generatedSamples": [{
        "video": {
          "uri": "https://generativelanguage.googleapis.com/v1beta/files/abc123"
        }
      }],
      "raiMediaFilteredCount": 0,
      "raiMediaFilteredReasons": []
    }
  }
}
```

### 下载视频

```python
# 用 x-goog-api-key header 下载（不是 ?key= query param）
video_uri = result["response"]["generateVideoResponse"]["generatedSamples"][0]["video"]["uri"]
video_resp = urllib.request.urlopen(
    urllib.request.Request(video_uri, headers={"x-goog-api-key": api_key}))
with open("output.mp4", "wb") as f:
    f.write(video_resp.read())
```

### 完整 Python 脚本（Google 直调，已验证）

```python
import base64, json, urllib.request, os, time

API_KEY = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
BASE = "https://generativelanguage.googleapis.com/v1beta"

def generate_video(prompt, output_path, aspect="16:9", duration=8, image_path=None, model="fast"):
    model_id = f"veo-3.1-{model}-generate-preview"

    instance = {"prompt": prompt}
    if image_path:
        with open(image_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        instance["image"] = {"bytesBase64Encoded": b64, "mimeType": "image/jpeg"}

    # 1. 提交异步任务
    payload = json.dumps({
        "instances": [instance],
        "parameters": {"aspectRatio": aspect, "resolution": "720p", "durationSeconds": duration}
    }).encode()
    req = urllib.request.Request(
        f"{BASE}/models/{model_id}:predictLongRunning",
        data=payload,
        headers={"x-goog-api-key": API_KEY, "Content-Type": "application/json"},
        method="POST"
    )
    resp = json.loads(urllib.request.urlopen(req, timeout=60).read())
    if "error" in resp:
        raise Exception(f"Veo API error: {resp['error'].get('message', resp['error'])}")
    op_name = resp["name"]
    print(f"Operation: {op_name}")

    # 2. 轮询（10 秒间隔，最多 5 分钟）
    for i in range(30):
        time.sleep(10)
        poll_req = urllib.request.Request(f"{BASE}/{op_name}", headers={"x-goog-api-key": API_KEY})
        status = json.loads(urllib.request.urlopen(poll_req).read())

        if status.get("error"):
            raise Exception(f"Generation failed: {status['error'].get('message')}")

        if status.get("done"):
            # 检查安全过滤
            rai = status.get("response", {}).get("generateVideoResponse", {}).get("raiMediaFilteredReasons", [])
            if rai:
                raise Exception(f"Safety filter: {rai[0]}")

            video_uri = status["response"]["generateVideoResponse"]["generatedSamples"][0]["video"]["uri"]
            # 下载视频
            video_req = urllib.request.Request(video_uri, headers={"x-goog-api-key": API_KEY})
            video_data = urllib.request.urlopen(video_req).read()
            with open(output_path, "wb") as f:
                f.write(video_data)
            print(f"Saved: {output_path} ({len(video_data)/1024/1024:.1f}MB)")
            return output_path

        print(f"Waiting... ({(i+1)*10}s)")

    raise TimeoutError("Video generation timed out (5 min)")
```

## 方式二：fal.ai（按秒计费，支持首尾帧）

**Env**: `FAL_KEY`
**费用**: $0.20/秒(720p无音频) ~ $0.60/秒(4K含音频)

### Image-to-Video（单张首帧）

```bash
# 1. 上传图片到 fal.ai 存储
UPLOAD=$(curl -s -X POST "https://rest.alpha.fal.ai/storage/upload/initiate" \
  -H "Authorization: Key $FAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{"file_name": "frame.jpg", "content_type": "image/jpeg"}')

UPLOAD_URL=$(echo $UPLOAD | python3 -c "import sys,json; print(json.load(sys.stdin)['upload_url'])")
FILE_URL=$(echo $UPLOAD | python3 -c "import sys,json; print(json.load(sys.stdin)['file_url'])")

# 2. 上传文件内容
curl -s -X PUT "$UPLOAD_URL" -H "Content-Type: image/jpeg" --data-binary @frame.jpg

# 3. 提交视频生成
curl -s "https://fal.run/fal-ai/veo3.1/image-to-video" \
  -H "Authorization: Key $FAL_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\": \"Camera slowly pushes in, cinematic\",
    \"image_url\": \"$FILE_URL\",
    \"duration\": \"8s\",
    \"resolution\": \"1080p\",
    \"generate_audio\": true
  }"
```

**Response**:
```json
{
  "video": {
    "url": "https://v3b.fal.media/files/.../output.mp4",
    "content_type": "video/mp4",
    "file_size": 1234567
  }
}
```

### First-Last-Frame-to-Video（首尾帧，fal.ai 独有）

```bash
curl -s "https://fal.run/fal-ai/veo3.1/fast/first-last-frame-to-video" \
  -H "Authorization: Key $FAL_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\": \"Smooth camera transition between scenes\",
    \"first_frame_url\": \"$FIRST_FRAME_URL\",
    \"last_frame_url\": \"$LAST_FRAME_URL\",
    \"duration\": \"8s\",
    \"resolution\": \"1080p\",
    \"generate_audio\": true,
    \"negative_prompt\": \"blurry, distorted\"
  }"
```

### fal.ai 参数说明

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `prompt` | string | 必填 | 视频运动描述 |
| `image_url` | string | 必填(i2v) | 首帧图片 URL |
| `first_frame_url` | string | 必填(flf) | 首帧 URL（first-last-frame 模式） |
| `last_frame_url` | string | 必填(flf) | 尾帧 URL（first-last-frame 模式） |
| `duration` | enum | `"8s"` | `"4s"` / `"6s"` / `"8s"` |
| `resolution` | enum | `"720p"` | `"720p"` / `"1080p"` / `"4k"` |
| `generate_audio` | bool | `true` | 生成环境音效 |
| `negative_prompt` | string | 无 | 不希望出现的内容 |
| `aspect_ratio` | enum | `"auto"` | `"auto"` / `"16:9"` / `"9:16"` |
| `safety_tolerance` | enum | `"4"` | `"1"`-`"6"`，越高越宽松 |

### fal.ai 文件上传

本地图片需要先上传到 fal.ai 存储获取 URL：

```python
import json, urllib.request, os

FAL_KEY = os.environ["FAL_KEY"]

def upload_to_fal(file_path):
    """上传本地文件到 fal.ai 存储，返回可访问的 URL"""
    filename = os.path.basename(file_path)
    content_type = "image/jpeg" if filename.endswith(".jpg") else "image/png"

    # 1. 获取上传 URL
    req = urllib.request.Request(
        "https://rest.alpha.fal.ai/storage/upload/initiate",
        data=json.dumps({"file_name": filename, "content_type": content_type}).encode(),
        headers={"Authorization": f"Key {FAL_KEY}", "Content-Type": "application/json"},
        method="POST"
    )
    resp = json.loads(urllib.request.urlopen(req).read())
    upload_url = resp["upload_url"]
    file_url = resp["file_url"]

    # 2. 上传文件内容
    with open(file_path, "rb") as f:
        put_req = urllib.request.Request(upload_url, data=f.read(),
            headers={"Content-Type": content_type}, method="PUT")
        urllib.request.urlopen(put_req)

    return file_url
```

## 模型变体

| 模型 | 速度 | 质量 | Provider |
|------|------|------|----------|
| `veo-3.1-fast-generate-preview` | 1-2 min | ★★★★ | Google |
| `veo-3.1-generate-preview` | 2-4 min | ★★★★★ | Google |
| `fal-ai/veo3.1/image-to-video` | 1-3 min | ★★★★ | fal.ai |
| `fal-ai/veo3.1/fast/first-last-frame-to-video` | 1-2 min | ★★★★ | fal.ai |
| `fal-ai/veo3.1/extend-video` | 1-3 min | ★★★★ | fal.ai（视频续写） |

## 踩坑记录

1. **Google: `inlineData` 不支持** — 图片必须用 `bytesBase64Encoded`，不是 `inlineData`
2. **Google: `fileUri` 不支持** — 不能用 Files API 上传后引用
3. **Google: `personGeneration: 'allow_all'` 不支持** — fast 版本不允许此参数
4. **Google: base64 太大无法嵌入 shell** — 图片 base64 超过 shell ARG_MAX 限制，必须用 Python/Node.js 脚本提交
5. **Google: 需要 proxy** — macOS Node.js 需 undici ProxyAgent；Python urllib / curl 走系统代理
6. **Google: 下载用 header 认证** — `x-goog-api-key` header，不是 `?key=` query param（newton-cat 验证）
7. **Google: RAI 安全过滤** — 检查 `raiMediaFilteredReasons`，中文配音内容容易触发
8. **fal.ai: 同步端点会阻塞** — `fal.run` 是同步的（等完成才返回），大批量用 `queue.fal.run` 异步
9. **fal.ai: 图片需要 URL** — 本地文件需先上传到 fal 存储（`rest.alpha.fal.ai/storage/upload/initiate`）
10. **fal.ai: 测试也收费** — 即使 prompt 是 "test" 也会生成视频并按秒计费，不要用 fal.ai 探测端点
11. **可含语音**: prompt 中加 "Include synchronized narration audio" 可生成带旁白的视频（但音色不可控）
12. **典型耗时**: 1-3 分钟，轮询间隔 10 秒

## API Keys

| 变量 | Provider | 位置 |
|------|----------|------|
| `GOOGLE_API_KEY` / `GEMINI_API_KEY` | Google 直调 | `~/.claude/.env` |
| `FAL_KEY` | fal.ai | `~/.claude/.env` |

## 与其他 skill 的关系

- **content-scene-breakdown** 输出分镜 prompt → 本 skill 生成视频片段
- **atomic-image-gen** 生成参考图 → 本 skill image2video 模式
- 本 skill 输出视频片段 → **media:video-compose** 合成完整视频
- 本 skill 输出视频片段 → **atomic-video-cut** 剪辑拼接
- **media-voice** 可替换 Veo 自带的音色

## 验收记录

- **newton-cat 项目验证**: Google 直调 image-to-video 成功，9:16 竖版，8秒/段，5 段拼接 ~40 秒视频
- **fal.ai 文件上传验证**: `rest.alpha.fal.ai/storage/upload/initiate` → PUT 上传 → 获取可访问 URL

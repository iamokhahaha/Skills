---
name: atomic-image-fetch
description: "Unsplash 免费图片搜索下载。用于文章配图、封面素材、背景图片。触发词：搜索图片、找图、image fetch、下载图片、找配图、找素材图、unsplash、找封面图"
---

# atomic-image-fetch

> 关键词 → Unsplash 搜索 → 下载高质量免费图片

REST API skill。从 Unsplash 搜索并下载免费可商用图片，用于文章配图、视频素材、封面等。

## 触发词

- 搜索图片、找图、image fetch
- 下载图片、找配图、Unsplash

## 输入

| 项目 | 必填 | 说明 |
|------|------|------|
| query | ✅ | 搜索关键词（英文效果最佳） |
| count | 可选 | 下载数量（默认 3，最多 30） |
| orientation | 可选 | `landscape` / `portrait` / `squarish` |
| size | 可选 | `raw` / `full` / `regular`（默认 1080w）/ `small` / `thumb` |
| output_dir | 可选 | 输出目录（默认 `./images/`） |
| color | 可选 | 颜色筛选：`black_and_white` / `black` / `white` / `yellow` / `orange` / `red` / `purple` / `magenta` / `green` / `teal` / `blue` |

## 输出

```json
{
  "query": "mountain sunset",
  "total_results": 5432,
  "downloaded": [
    {
      "id": "abc123",
      "path": "images/mountain-sunset-1.jpg",
      "width": 1920,
      "height": 1280,
      "photographer": "John Doe",
      "unsplash_url": "https://unsplash.com/photos/abc123",
      "download_url": "https://images.unsplash.com/photo-xxx?w=1080"
    }
  ]
}
```

## API 调用

**Env**: `UNSPLASH_ACCESS_KEY`（存在 `~/.claude/skills/publish-preview/.env`）

### 搜索

```bash
curl -s "https://api.unsplash.com/search/photos?query=mountain+sunset&per_page=10&orientation=landscape" \
  -H "Authorization: Client-ID $UNSPLASH_ACCESS_KEY"
```

**Response**:
```json
{
  "total": 5432,
  "results": [
    {
      "id": "abc123",
      "width": 4000,
      "height": 2667,
      "urls": {
        "raw": "https://images.unsplash.com/photo-xxx",
        "full": "https://images.unsplash.com/photo-xxx?q=85&w=original",
        "regular": "https://images.unsplash.com/photo-xxx?w=1080",
        "small": "https://images.unsplash.com/photo-xxx?w=400",
        "thumb": "https://images.unsplash.com/photo-xxx?w=200"
      },
      "user": {
        "name": "John Doe",
        "links": {"html": "https://unsplash.com/@johndoe"}
      },
      "links": {
        "html": "https://unsplash.com/photos/abc123",
        "download_location": "https://api.unsplash.com/photos/abc123/download"
      }
    }
  ]
}
```

### 下载（触发计数）

Unsplash 要求使用 `download_location` 端点来触发下载计数（API guideline）：

```bash
# 1. 触发下载计数
curl -s "https://api.unsplash.com/photos/abc123/download" \
  -H "Authorization: Client-ID $UNSPLASH_ACCESS_KEY"
# → {"url": "https://images.unsplash.com/photo-xxx?..."}

# 2. 下载图片
curl -o "images/mountain-sunset-1.jpg" \
  "https://images.unsplash.com/photo-xxx?w=1080"
```

### 搜索参数

| 参数 | 说明 |
|------|------|
| `query` | 搜索关键词 |
| `page` | 分页（默认 1） |
| `per_page` | 每页数量（默认 10，最多 30） |
| `orientation` | 方向筛选 |
| `color` | 颜色筛选 |
| `order_by` | `relevant`（默认）/ `latest` |

## 完整下载脚本

```python
import requests, os, json

UNSPLASH_KEY = os.environ.get("UNSPLASH_ACCESS_KEY", "")
BASE = "https://api.unsplash.com"
HEADERS = {"Authorization": f"Client-ID {UNSPLASH_KEY}"}

def search_and_download(query, count=3, orientation=None, output_dir="images"):
    os.makedirs(output_dir, exist_ok=True)

    params = {"query": query, "per_page": min(count, 30)}
    if orientation:
        params["orientation"] = orientation

    resp = requests.get(f"{BASE}/search/photos", headers=HEADERS, params=params)
    results = resp.json()["results"][:count]

    downloaded = []
    for i, photo in enumerate(results):
        # 触发下载计数
        requests.get(
            f"{BASE}/photos/{photo['id']}/download",
            headers=HEADERS
        )
        # 下载图片
        img_url = photo["urls"]["regular"]
        filename = f"{query.replace(' ', '-')}-{i+1}.jpg"
        filepath = os.path.join(output_dir, filename)

        img_resp = requests.get(img_url)
        with open(filepath, "wb") as f:
            f.write(img_resp.content)

        downloaded.append({
            "id": photo["id"],
            "path": filepath,
            "photographer": photo["user"]["name"],
            "unsplash_url": photo["links"]["html"]
        })

    return downloaded
```

## 使用注意

- **Attribution**: Unsplash 图片免费可商用，但建议标注摄影师（非强制）
- **Rate Limit**: 免费 50 请求/小时（Demo），申请 Production 后 5000/小时
- **搜索技巧**: 用英文关键词效果远好于中文
- **尺寸**: `regular` (1080w) 适合大多数场景；`full` 适合打印/4K

## API Key 位置

| 变量 | 位置 |
|------|------|
| `UNSPLASH_ACCESS_KEY` | `~/.claude/skills/publish-preview/.env` |

## 与其他 skill 的关系

- **content-scene-breakdown** 输出分镜 → 用关键词搜索配图（AI 生图的补充）
- **publish-preview** 已内置 Unsplash 搜索（本 skill 提炼独立）
- 本 skill 输出图片 → 各 publish skill 发布

## 测试用例

### 测试 1: 基础搜索下载
```
输入:
  query: "coding workspace"
  count: 3
  orientation: landscape

预期: 3 张横向图片下载到 images/ 目录
```

---

## 验收记录

<!-- 测试通过后填写 -->

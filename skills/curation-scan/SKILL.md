---
name: curation-scan
description: "AI热点内容采集。两阶段：Phase 1 多源扫描(WebSearch/HN/YouTube/Twitter/Tavily) → Phase 2 深度提取。按日期存储，支持博主 watchlist。触发词：AI采集、每日热点、curation scan、今日AI"
---

# curation-scan — AI 热点内容采集

> 多源扫描 → 去重聚类评分 → 精采深挖 → 输出结构化热点 JSON + 日报

## 触发短语
- "AI采集" / "每日热点" / "curation scan" / "今日AI" / "粗采集" / "精采集"

## 快速启动

用户说 "AI采集" 时，Claude 执行以下流程：

### Step 1: 跑 API 采集脚本（HN + YouTube + Tavily + Twitter 并行）
```bash
source .claude/.env && export TAVILY_API_KEY GOOGLE_API_KEY_YOUTUBE X_CLIENT_ID X_CLIENT_SECRET && \
  npx tsx \
  .claude/skills/curation-scan/scripts/curation-scan.ts
```
脚本输出到 `curation/YYYY-MM-DD/` 下的 4 个 raw JSON 文件。

### Step 2: Claude 同时跑 WebSearch（5 轮中英文查询）

### Step 3: Claude 读取所有 raw 数据 + WebSearch 结果 → AI 去重聚类评分 → 输出 scan.json + summary.md

**Twitter token 过期处理**：脚本内自动用 refresh_token 刷新。如果 refresh 失败，需重新授权：
```bash
source .claude/.env && export X_CLIENT_ID X_CLIENT_SECRET && \
  npx tsx \
  ~/.claude/skills/analytics-comment-twitter/scripts/twitter-oauth.ts
```

---

## 两阶段设计

### Phase 1: 初采（Scan）
脚本跑 4 个 API 渠道 + Claude WebSearch，AI 去重+聚类+评分，输出 10-20 条热点。

### Phase 2: 精采（Deep Collect）
用户从 scan 结果中选题，深度提取素材（全文、转录、配图）。

---

## Phase 1: Scan 流程

### 数据源（5 个渠道）
- **HN / YouTube / Tavily / Twitter**: `curation-scan.ts` 脚本并行执行
- **WebSearch**: Claude 对话内执行

#### 1. WebSearch（Claude 内置）
- 直接用 Claude 的 WebSearch 工具
- 查询示例：`AI news today March 2026`、`AI最新消息 2026年3月`
- 多轮查询覆盖中英文、不同角度

#### 2. Hacker News API（免费，无需认证）
```bash
# Top Stories（返回 ~500 个 story ID）
curl "https://hacker-news.firebaseio.com/v0/topstories.json"

# 获取单条 story 详情
curl "https://hacker-news.firebaseio.com/v0/item/{ID}.json"
```
- 取 Top 30 stories，按 score 排序
- 过滤 AI 相关关键词：AI, LLM, GPT, Claude, model, neural, transformer, agent, ML, machine learning
- 提取：title, url, score, descendants(评论数)

#### 3. YouTube Data API v3
```bash
# 频道最新视频
curl "https://www.googleapis.com/youtube/v3/search?part=snippet&channelId={CHANNEL_ID}&order=date&publishedAfter={7天前ISO}&maxResults=5&type=video&key={KEY}"

# 视频统计（批量，逗号分隔 ID）
curl "https://www.googleapis.com/youtube/v3/videos?part=statistics&id={ID1,ID2,...}&key={KEY}"

# 关键词搜索（消耗 100 units/次，控制数量）
curl "https://www.googleapis.com/youtube/v3/search?part=snippet&q={QUERY}&type=video&maxResults=10&publishedAfter={7天前ISO}&key={KEY}"
```
- 环境变量：`GOOGLE_API_KEY_YOUTUBE`（项目 .claude/.env）
- 每日配额 10,000 units，search 最贵（100/次），channel search 只要 1/次
- 先扫 watchlist 频道（1 unit/次），再补充搜索（100 units/次，控制 ≤7 次）

#### 4. Tavily Search API
```bash
curl -X POST "https://api.tavily.com/search" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "{TAVILY_API_KEY}",
    "query": "AI news March 2026",
    "search_depth": "basic",
    "max_results": 10,
    "include_answer": true,
    "days": 7
  }'
```
- 环境变量：`TAVILY_API_KEY`（项目 .claude/.env）
- 免费额度：1000 次/月（basic=1 credit, advanced=2 credits）
- Phase 1 用 `basic`（标题+URL+短摘要够判断话题）
- Phase 2 精采时改 `advanced`（需要完整 content 片段）
- `days: 7` 限制最近 7 天
- 建议 5 个查询，覆盖不同主题角度

#### 5. Twitter API v2（OAuth 2.0）
```bash
curl "https://api.twitter.com/2/tweets/search/recent?query={QUERY}&tweet.fields=public_metrics,created_at,author_id&expansions=author_id&user.fields=name,username,public_metrics&max_results=100&sort_order=relevancy" \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```
- Token 存储：`tmp/.twitter-tokens.json`（自动 refresh）
- 认证参考：`analytics-comment-twitter` skill
- Basic Plan：10,000 条/月读取，60 次/15min 搜索，仅最近 7 天
- **注意**：Basic Plan 不支持 `min_faves` 等高级运算符
- 建议 10 个查询，mix 博主（`from:username`）和话题关键词

### Scan 输出

存储路径：`curation/YYYY-MM-DD/`

```
curation/2026-03-16/
├── scan.json              ← 结构化热点（主输出）
├── summary.md             ← 人工可读日报
├── twitter-raw.json       ← Twitter 原始数据
├── youtube-raw.json       ← YouTube 原始数据
├── tavily-raw.json        ← Tavily 原始数据
└── watchlist.json         ← 博主关注列表（可选，也可放 curation/ 根目录）
```

#### scan.json 结构
```json
{
  "date": "2026-03-16",
  "scan_time": "2026-03-16T12:30:00+08:00",
  "channels": {
    "web_search": { "status": "ok", "method": "Claude WebSearch" },
    "hacker_news": { "status": "ok", "method": "HN Firebase API" },
    "youtube": { "status": "ok", "method": "YouTube Data API v3", "raw_file": "youtube-raw.json" },
    "twitter": { "status": "ok", "method": "Twitter API v2", "raw_file": "twitter-raw.json" },
    "tavily": { "status": "ok", "method": "Tavily Search API", "raw_file": "tavily-raw.json" }
  },
  "topics": [
    {
      "id": 1,
      "title": "话题标题",
      "summary": "一段话摘要",
      "score": 98,
      "tags": ["标签1", "标签2"],
      "channel_hits": ["web_search", "youtube", "twitter"],
      "sources": ["https://..."],
      "youtube_related": [{ "channel": "...", "title": "...", "url": "...", "views": 0, "date": "..." }],
      "twitter_related": [{ "author": "@...", "text": "...", "impressions": 0, "url": "..." }],
      "why_important": "为什么值得关注"
    }
  ]
}
```

#### summary.md 结构
```markdown
# AI 热点日报 — YYYY-MM-DD

## 今日头条（Top 3，score ≥ 85）
### 1. 标题 ⭐score
摘要

## 行业动态（score 65-84）
### 4. 标题 ⭐score

## 创作推荐
| 优先级 | 话题 | 内容形态 | 理由 |
```

---

## Watchlist（博主关注列表）

存储路径：`curation/watchlist.json`

```json
{
  "twitter": [
    { "username": "karpathy", "label": "Andrej Karpathy" },
    { "username": "OpenAI", "label": "OpenAI" },
    { "username": "AnthropicAI", "label": "Anthropic" },
    { "username": "GoogleDeepMind", "label": "Google DeepMind" },
    { "username": "elonmusk", "label": "Elon Musk" },
    { "username": "sama", "label": "Sam Altman" },
    { "username": "svpino", "label": "Santiago" },
    { "username": "GaryMarcus", "label": "Gary Marcus" },
    { "username": "fchollet", "label": "François Chollet" },
    { "username": "hardmaru", "label": "David Ha / Sakana AI" },
    { "username": "ylecun", "label": "Yann LeCun" },
    { "username": "AndrewYNg", "label": "Andrew Ng" },
    { "username": "jimfan", "label": "Jim Fan / NVIDIA" }
  ],
  "youtube": [
    { "channelId": "UCsBjURrPoezykLs9EqgamOA", "label": "Fireship" },
    { "channelId": "UCbfYPyITQ-7l4upoX8nvctg", "label": "Two Minute Papers" },
    { "channelId": "UCSHZKyawb77ixDdsGog4iWA", "label": "Lex Fridman" },
    { "channelId": "UCJIfeSCssxSC_Dhc5s7woww", "label": "Matt Wolfe" },
    { "channelId": "UCWN3xxRkmTPphYnPVR_JOQQ", "label": "AI Explained" },
    { "channelId": "UCZHmQk67mSJgfCCTn7xBfew", "label": "Yannic Kilcher" },
    { "channelId": "UCHBzM4FVmUQ4NeVq3Ij0KfA", "label": "TheAIGRID" },
    { "channelId": "UCg6gPGh8HU2U01vaFCAsvmQ", "label": "Matthew Berman" },
    { "channelId": "UCKNSRReFslgV1WVLbGYcXwg", "label": "WorldofAI" }
  ]
}
```

Scan 时自动遍历：
- Twitter: 将 watchlist 用户分组，每组 3-5 人拼 `from:user1 OR from:user2` 查询
- YouTube: 逐频道 `search?channelId=xxx&order=date` 取最新视频

---

## Phase 2: Deep Collect（精采）

用户从 scan.json 选中话题后执行，或直接给出 URL 进行精采。

### 精采入口

任意来源的 URL 都可以精采：
- WebSearch / HN / Tavily 粗采发现的文章链接
- Twitter 推文链接
- YouTube 视频链接
- 用户手动提供的任意网页 URL

### 精采工具矩阵

Phase 2 **引用现有 skill**，不重复实现 API 调用：

| URL 类型 | 数据采集（API） | 媒体下载（yt-dlp/curl） | 内容提取（AI） |
|---------|---------------|----------------------|--------------|
| 网页文章 | Tavily Extract（见下方） | 文章内嵌图片 `curl -o` | — |
| YouTube | → **analytics-comment-youtube** | yt-dlp（视频/音频/缩略图/字幕） | → **content-yt-insight**（可选） |
| Twitter | → **analytics-comment-twitter** | 配图/视频下载（见下方） | — |
| 播客 | — | atomic-audio-extract | atomic-subtitle-gen |

#### 1. 网页文章 — Tavily Extract
```bash
curl -X POST "https://api.tavily.com/extract" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "{TAVILY_API_KEY}",
    "urls": ["https://example.com/article1", "https://example.com/article2"]
  }'
```
- 支持批量 URL（一次最多 20 个）
- 返回 `results[].raw_content`（完整正文）
- 计费：每个 URL 算 1 credit
- 文章内嵌图片：解析返回内容中的图片 URL → `curl -o` 下载到 `images/`
- 文章内嵌视频：解析 YouTube/视频链接 → 走 YouTube 精采流程

#### 2. YouTube 视频

**数据采集**：调用 `analytics-comment-youtube` skill（视频元数据 + 评论），输出 `tmp/youtube-crawl-{VIDEO_ID}.json`

**媒体下载**（curation 独有，analytics-comment-youtube 不做）：
```bash
# 下载视频（最佳质量）
yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]" \
  -o "videos/%(id)s.%(ext)s" "https://youtube.com/watch?v={VIDEO_ID}"

# 仅下载音频（用于转录）
yt-dlp -x --audio-format mp3 \
  -o "audio/%(id)s.%(ext)s" "https://youtube.com/watch?v={VIDEO_ID}"

# 下载缩略图
yt-dlp --write-thumbnail --skip-download \
  -o "images/%(id)s" "https://youtube.com/watch?v={VIDEO_ID}"

# 下载字幕（如有）
yt-dlp --write-auto-subs --sub-lang en,zh --skip-download \
  -o "transcripts/%(id)s" "https://youtube.com/watch?v={VIDEO_ID}"
```

**AI 总结**（可选）：调用 `content-yt-insight` skill → 字幕提取 + AI 千字总结 + 截帧封面

#### 3. Twitter 推文/线程

**数据采集**：调用 `analytics-comment-twitter` skill（推文信息 + 回复线程），输出 `tmp/twitter-crawl-{TWEET_ID}.json`

**媒体下载**（curation 独有，analytics-comment-twitter 不做）：
- 推文配图：从 crawl 结果的 `includes.media` 中 `type=photo` 获取 `url` → `curl -o` 下载到 `images/`
- 推文视频：`type=video` 的 `preview_image_url`（缩略图）+ yt-dlp 下载视频
  ```bash
  yt-dlp -o "videos/%(id)s.%(ext)s" "https://x.com/user/status/{TWEET_ID}"
  ```
- 作者头像：`includes.users[].profile_image_url`（替换 `_normal` 为 `_400x400` 获取高清）

**注意**：analytics-comment-twitter 目前不返回 `attachments.media_keys` 和 `media.fields`。精采时需在 analytics-comment-twitter 的 API 调用中追加 `&expansions=attachments.media_keys&media.fields=url,preview_image_url,type,variants` 参数。

#### 4. 补充素材
| 素材类型 | 工具 | 说明 |
|---------|------|------|
| 补充配图 | atomic-image-fetch | Unsplash 搜索相关关键词 |
| 论文全文 | Tavily Extract / arXiv API | PDF URL 提取或下载 |
| 播客音频 | atomic-audio-extract + atomic-subtitle-gen | 下载 → STT 转文字 |

### 精采输出

```
curation/2026-03-16/topics/
└── ai-replacing-junior-devs/
    ├── sources.json           ← 素材索引（所有文件路径 + 元数据）
    ├── articles/              ← Tavily Extract 提取的文章全文
    ├── transcripts/           ← YouTube/播客 STT 转录文本
    ├── images/                ← 文章配图 + 推文配图 + 视频缩略图 + Unsplash
    ├── videos/                ← YouTube/Twitter 下载的视频文件
    ├── creation/              ← Phase 3 创作输出
    └── publish/               ← 各平台适配版本
```

---

## 环境变量

| 变量 | 用途 | 位置 |
|------|------|------|
| `TAVILY_API_KEY` | Tavily 搜索 + 提取 | 项目 .claude/.env |
| `GOOGLE_API_KEY_YOUTUBE` | YouTube Data API v3 | 项目 .claude/.env |
| Twitter OAuth tokens | Twitter API v2 | tmp/.twitter-tokens.json |

WebSearch 和 HN API 无需额外配置。

## 用量控制

| 渠道 | 每次 scan 消耗 | 月度限制 |
|------|---------------|---------|
| WebSearch | ~5 次查询 | 无限制 |
| Hacker News | ~30 次 API 调用 | 无限制（免费） |
| YouTube | ~20 channel + ~7 search = ~720 units | 10,000 units/天 |
| Tavily | ~5 次 basic search (5 credits) | 1,000 credits/月（basic=1, advanced=2） |
| Twitter | ~10 次 search (~1000 条读取) | 10,000 条/月, 60次/15min |

**每日 scan 成本**：Twitter $100/月（Basic Plan），其余免费。

## 验收记录

### 2026-03-16 首次完整 Scan
- 5 渠道全部成功
- WebSearch: 多轮查询，获取 ~11 条头条级热点
- HN API: Top 30 stories 过滤出 4 条 AI 相关（LLM Architecture Gallery 404分最高）
- YouTube: 15 频道 + 7 搜索 → 58 条视频（Fireship 580K views 最高）
- Tavily: 5 advanced queries → 40 条结果（含 content snippets）
- Twitter: 10 queries → 75 条推文（Karpathy 2.08M impressions 最高）
- 输出: scan.json (26 topics), summary.md, twitter-raw.json, youtube-raw.json, tavily-raw.json
- **已知问题**: Twitter Basic Plan 不支持 `min_faves` 运算符，需用 `sort_order=relevancy` 替代

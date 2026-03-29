---
name: analytics-comment-youtube
description: "YouTube视频+评论采集。YouTube Data API v3，需API Key。支持视频信息、评论(含回复)、搜索。触发词：YouTube采集、youtube crawl、YouTube评论"
---

# analytics-comment-youtube — YouTube 数据采集

> 视频 URL 或关键词 → YouTube Data API v3 → 帖子信息 + 全量评论 JSON

## 触发短语
- "YouTube采集" / "youtube crawl" / "YouTube评论" / "YouTube数据"

## 法律风险：极低
Google 官方 API，TOS 明确允许。

## 认证
- 需要 `GOOGLE_API_KEY` 环境变量
- API Key 通过 `key` query 参数传递
- 公开数据不需要 OAuth（视频信息、评论、搜索）
- 获取 API Key: Google Cloud Console → APIs & Services → Credentials → Create API Key → 启用 YouTube Data API v3

## API 端点

### 1. 视频信息
```bash
curl "https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id={VIDEO_ID}&key={GOOGLE_API_KEY}"
```
返回: `items[0].snippet`（title, description, publishedAt, channelTitle）、`items[0].statistics`（viewCount, likeCount, commentCount）

### 2. 评论（含回复）
```bash
curl "https://www.googleapis.com/youtube/v3/commentThreads?part=snippet,replies&videoId={VIDEO_ID}&maxResults=100&order=relevance&key={GOOGLE_API_KEY}"
```
- `maxResults`: 最大 100
- `order`: `relevance`（默认）或 `time`
- `pageToken`: 分页 token，首页不传，后续从响应的 `nextPageToken` 获取
- 终止条件: 响应中没有 `nextPageToken`
- `replies` 部分最多返回 5 条回复，超过需用 comments.list 接口

### 3. 获取更多回复（当回复 >5 条时）
```bash
curl "https://www.googleapis.com/youtube/v3/comments?part=snippet&parentId={COMMENT_ID}&maxResults=100&key={GOOGLE_API_KEY}"
```

### 4. 搜索
```bash
curl "https://www.googleapis.com/youtube/v3/search?part=snippet&q={QUERY}&type=video&maxResults=25&key={GOOGLE_API_KEY}"
```
- `type`: video / channel / playlist
- `maxResults`: 最大 50

## 配额管理
| 操作 | 消耗 units |
|------|-----------|
| videos.list | 1 |
| commentThreads.list | 1 |
| comments.list | 1 |
| search.list | **100** |

每日免费配额: **10,000 units**。搜索最贵（100 units/次），谨慎使用。

采集一个视频的全部评论（假设 500 条 = 5 页 commentThreads + 若干 comments.list）≈ 10-20 units，非常充裕。

## 频率控制
- 无严格频率限制，但建议间隔 200ms
- 超配额返回 403 `quotaExceeded`

## 从 URL 提取 Video ID
```
https://www.youtube.com/watch?v=dQw4w9WgXcQ → dQw4w9WgXcQ
https://youtu.be/dQw4w9WgXcQ → dQw4w9WgXcQ
https://www.youtube.com/shorts/dQw4w9WgXcQ → dQw4w9WgXcQ
```

## 输出格式
```json
{
  "platform": "youtube",
  "post_id": "dQw4w9WgXcQ",
  "post_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "post_info": {
    "title": "视频标题",
    "author": "频道名",
    "author_id": "UCxxxxx",
    "published_at": "2026-03-01T10:00:00Z",
    "metrics": {
      "views": 125000,
      "likes": 3420,
      "comments": 670
    }
  },
  "total_comments": 670,
  "comments": [
    {
      "id": "comment-id",
      "author": "昵称",
      "author_id": "UCxxxxx",
      "text": "评论内容",
      "time": "2026-03-01T10:00:00Z",
      "likes": 42,
      "replies": [
        {
          "id": "reply-id",
          "author": "回复者",
          "author_id": "UCxxxxx",
          "text": "回复内容",
          "time": "2026-03-01T11:00:00Z",
          "likes": 5
        }
      ]
    }
  ],
  "collected_at": "2026-03-09T12:00:00Z"
}
```

输出路径: `tmp/youtube-crawl-{VIDEO_ID}.json`

## 测试用例
1. 给定 video ID → 获取视频信息 + 统计数据 → 验证字段完整
2. 采集评论（含 >5 条回复的 thread）→ 分页 + 子回复完整
3. 搜索关键词 → 返回 Top 10 视频结果
4. 验证配额消耗合理（单次采集 < 50 units）

## 验收记录
<!-- 测试结果记录区 -->

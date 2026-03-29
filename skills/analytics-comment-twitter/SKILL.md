---
name: analytics-comment-twitter
description: "Twitter/X帖子+评论采集。Twitter API v2，OAuth 2.0 PKCE认证。支持推文信息、回复采集、搜索。触发词：Twitter采集、twitter crawl、推特评论、X采集"
---

# analytics-comment-twitter — Twitter/X 数据采集

> 推文 URL 或关键词 → Twitter API v2 → 推文信息 + 回复 JSON

## 触发短语
- "Twitter采集" / "twitter crawl" / "推特评论" / "X采集" / "采集推特回复"

## 法律风险：极低
付费官方 API，合规使用。

## 认证

### OAuth 2.0 PKCE（复用现有实现）
参考: `tmp/twitter-publish-thread.ts` 中的 OAuth 2.0 PKCE flow

- Token 存储: `tmp/.twitter-tokens.json`
- 首次运行: 打开浏览器完成 PKCE 授权
- 后续运行: 自动用 refresh_token 刷新
- 所需 Scopes: `tweet.read users.read offline.access`

### 请求头
```
Authorization: Bearer {ACCESS_TOKEN}
```

## API 端点

### 1. 推文信息
```bash
curl "https://api.twitter.com/2/tweets/{TWEET_ID}?tweet.fields=public_metrics,created_at,author_id,conversation_id&expansions=author_id&user.fields=name,username,profile_image_url" \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```
返回: `data`（text, public_metrics, created_at, conversation_id）、`includes.users`（author info）

### 2. 回复（通过搜索 conversation_id）
```bash
curl "https://api.twitter.com/2/tweets/search/recent?query=conversation_id:{TWEET_ID}&tweet.fields=public_metrics,created_at,author_id,in_reply_to_user_id&expansions=author_id&user.fields=name,username&max_results=100" \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```
- `max_results`: 10-100
- `next_token`: 分页 token，从响应的 `meta.next_token` 获取
- 终止条件: 响应中没有 `meta.next_token`

### 3. 搜索
```bash
curl "https://api.twitter.com/2/tweets/search/recent?query={QUERY}&tweet.fields=public_metrics,created_at,author_id&expansions=author_id&user.fields=name,username&max_results=100" \
  -H "Authorization: Bearer {ACCESS_TOKEN}"
```

## 计费与限制

### Basic Plan ($100/月)
| 资源 | 限制 |
|------|------|
| 读取推文 | 10,000 条/月 |
| 搜索 (recent) | 60 次/15min |
| 搜索时间范围 | **仅最近 7 天** |

### 注意事项
- recent search 只能搜最近 7 天，更早的回复无法获取
- `conversation_id` = 原推的 tweet_id，所有回复共享同一个 conversation_id
- 嵌套回复（reply to reply）也包含在 conversation_id 搜索结果中
- `in_reply_to_user_id` 可用于构建回复树

## 从 URL 提取 Tweet ID
```
https://twitter.com/username/status/1234567890 → 1234567890
https://x.com/username/status/1234567890 → 1234567890
```

## 频率控制
- 搜索: 60 次/15min（≈ 1 次/15s）
- 推文读取: 无严格频率限制，但建议间隔 1s
- 遇到 429 Too Many Requests → 等待 `x-rate-limit-reset` 头指示的时间

## 输出格式
```json
{
  "platform": "twitter",
  "post_id": "1234567890",
  "post_url": "https://x.com/username/status/1234567890",
  "post_info": {
    "title": "",
    "author": "显示名",
    "author_id": "@username",
    "published_at": "2026-03-01T10:00:00Z",
    "text": "推文全文",
    "metrics": {
      "likes": 342,
      "retweets": 56,
      "replies": 67,
      "quotes": 12,
      "impressions": 12500,
      "bookmarks": 23
    }
  },
  "total_comments": 67,
  "comments": [
    {
      "id": "reply-tweet-id",
      "author": "回复者显示名",
      "author_id": "@replier",
      "text": "回复内容",
      "time": "2026-03-01T11:00:00Z",
      "likes": 5,
      "replies": []
    }
  ],
  "collected_at": "2026-03-09T12:00:00Z"
}
```

输出路径: `tmp/twitter-crawl-{TWEET_ID}.json`

## 测试用例
1. 给定 tweet ID → 获取推文信息 + metrics → 验证字段完整
2. 采集回复（conversation_id 搜索）→ 分页正确
3. 搜索关键词 → 返回最近 7 天的推文
4. 验证 token 自动刷新工作正常

## 验收记录
<!-- 测试结果记录区 -->

---
name: analytics-comment-bilibili
description: "B站帖子+评论采集。公开API直调，无需登录。支持视频信息、评论(含楼中楼)、搜索。触发词：B站采集、bilibili crawl、B站评论、B站数据"
---

# analytics-comment-bilibili — B站数据采集

> 视频/文章 URL 或关键词 → 公开 API 调用 → 帖子信息 + 全量评论 JSON

## 触发短语
- "B站采集" / "bilibili crawl" / "B站评论" / "B站数据" / "采集B站评论"

## 法律风险：极低
B站 API 公开可用，无需绕过任何保护措施，不需要登录即可访问。

## 认证
- **无需登录**：视频信息、评论接口均为公开 API
- 可选加 Cookie 提升稳定性（从 infra-browser 提取）
- 必须加 `User-Agent` 头

## API 端点

### 1. 视频信息
```bash
curl "https://api.bilibili.com/x/web-interface/view?bvid=BV1xx411c7mD" \
  -H "User-Agent: Mozilla/5.0"
```
返回: `data.aid`（评论接口需要）、`data.title`、`data.desc`、`data.owner`、`data.stat`（view/like/coin/favorite/share/reply/danmaku）

### 2. 评论（主楼）
```bash
curl "https://api.bilibili.com/x/v2/reply/main?oid={AID}&type=1&mode=3&next=0" \
  -H "User-Agent: Mozilla/5.0"
```
- `oid`: 视频的 AID（从视频信息接口的 `data.aid` 获取）
- `type`: 1=视频, 12=专栏文章, 17=动态
- `mode`: 3=热度排序, 2=时间排序
- `next`: 分页游标，首页为 0，后续从响应的 `data.cursor.next` 获取
- 每页约 20 条
- 终止条件: `data.cursor.is_end == true`

### 3. 楼中楼（子回复）
```bash
curl "https://api.bilibili.com/x/v2/reply/reply?oid={AID}&type=1&root={RPID}&pn=1&ps=20" \
  -H "User-Agent: Mozilla/5.0"
```
- `root`: 主楼评论的 rpid
- `pn`: 页码，从 1 开始
- `ps`: 每页数量（最大 20）
- 终止条件: 返回数据为空或 `data.page.count` 已全部获取

### 4. 搜索
```bash
curl "https://api.bilibili.com/x/web-interface/search/all/v2?keyword=AI&page=1" \
  -H "User-Agent: Mozilla/5.0" \
  -H "Cookie: buvid3=xxx"
```
- 搜索需要 `buvid3` cookie，否则可能返回空结果
- `page`: 页码，从 1 开始
- 返回混合结果（视频/专栏/用户等）

## BV 转 AID
从视频信息接口响应中取 `data.aid`，无需手动转换。

## 频率控制
- 请求间隔 ≥ 500ms
- 并发数: 1（串行请求）
- 单次采集评论上限建议: 500 条
- 遇到 412 状态码 = 被风控，暂停 5 分钟

## 输出格式
```json
{
  "platform": "bilibili",
  "post_id": "BV1xx411c7mD",
  "post_url": "https://www.bilibili.com/video/BV1xx411c7mD",
  "post_info": {
    "title": "视频标题",
    "author": "UP主昵称",
    "author_id": "uid",
    "published_at": "2026-03-01T10:00:00Z",
    "metrics": {
      "views": 12500,
      "likes": 342,
      "coins": 56,
      "favorites": 78,
      "shares": 23,
      "comments": 67,
      "danmaku": 120
    }
  },
  "total_comments": 67,
  "comments": [
    {
      "id": "rpid",
      "author": "昵称",
      "author_id": "uid",
      "text": "评论内容",
      "time": "2026-03-01T10:00:00Z",
      "likes": 42,
      "replies": [
        {
          "id": "rpid",
          "author": "回复者",
          "author_id": "uid",
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

输出路径: `tmp/bilibili-crawl-{BVID}.json`

## 测试用例
1. 给定 BV 号 → 获取视频信息 + 统计数据 → 验证字段完整
2. 采集 ≥50 条评论的视频 → 分页正确 → 含楼中楼
3. 搜索关键词 → 返回 Top 10 结果

## 验收记录
<!-- 测试结果记录区 -->

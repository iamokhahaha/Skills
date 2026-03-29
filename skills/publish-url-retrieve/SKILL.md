---
name: publish-url-retrieve
description: "发布后获取帖子URL。从小红书/B站/公众号/YouTube获取最近发布内容的链接。触发词：获取帖子链接、post url retrieve、获取发布链接、帖子URL、get post url、发布链接"
---

# 帖子 URL 获取 Skill

浏览器自动化 skill — 从各平台获取已发布内容的 URL。用于发布后未自动返回 URL 的场景。

## 触发条件

- 发布后需要获取帖子链接
- 批量获取各平台最近发布的内容 URL
- 验证发布是否成功

## 输入

| 项目 | 必填 | 说明 |
|------|------|------|
| 平台 | ✅ | 目标平台（xhs / bilibili / douyin / jike / wechat） |
| 标题关键词 | 可选 | 用于匹配特定帖子（而非仅取最新） |
| 数量 | 可选 | 获取最近 N 条（默认 1） |

## 输出

```json
{
  "platform": "xhs",
  "posts": [
    {
      "post_id": "xxxxx",
      "url": "https://www.xiaohongshu.com/explore/xxxxx",
      "title": "帖子标题",
      "publish_time": "2026-03-04 12:00",
      "type": "video"
    }
  ]
}
```

---

## Step 1: 连接 Chrome 浏览器

通过 Chrome DevTools MCP 连接用户真实 Chrome 浏览器（CDP 端口 9222）。无需启动额外服务。

---

## 各平台策略

### 小红书 (XHS) — 发布后跳转 + 创作者中心

```typescript
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("post-url-retrieve");
await page.setViewportSize({ width: 1280, height: 800 });

// 策略 A: 发布后页面 URL 直接包含帖子 ID
// 发布成功后，XHS 通常跳转到创作者中心或笔记详情
// URL 格式: https://www.xiaohongshu.com/explore/{note_id}

// 策略 B: 到创作者中心"笔记管理"获取
await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await waitForPageLoad(page);

// 检查登录
if (page.url().includes("/login")) {
  console.log("需要登录小红书");
  await page.screenshot({ path: "tmp/xhs-login-retrieve.png" });
  await client.disconnect();
  // 等待用户登录
}

// 导航到笔记管理页
await page.goto("https://creator.xiaohongshu.com/creator/notes", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await waitForPageLoad(page);
await page.waitForTimeout(3000);

// 提取最近发布的笔记列表
const posts = await page.evaluate(() => {
  const results = [];
  // 查找笔记列表中的项目
  const items = document.querySelectorAll('[class*="note-item"], [class*="content-item"], tr');
  for (const item of items) {
    const title = item.querySelector('[class*="title"], td:first-child')?.textContent?.trim();
    const link = item.querySelector('a[href*="explore"], a[href*="note"]');
    const time = item.querySelector('[class*="time"], [class*="date"]')?.textContent?.trim();
    if (title) {
      results.push({
        title: title.slice(0, 50),
        url: link ? link.href : null,
        publish_time: time || null,
      });
    }
    if (results.length >= 5) break;
  }
  return results;
});

console.log("XHS 最近发布:", JSON.stringify(posts, null, 2));
await page.screenshot({ path: "tmp/xhs-posts-list.png" });
await client.disconnect();
```

### B站 (Bilibili) — 稿件管理页

```typescript
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("post-url-retrieve");
await page.setViewportSize({ width: 1280, height: 800 });

// B站稿件管理页
await page.goto("https://member.bilibili.com/platform/upload-manager/article", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await waitForPageLoad(page);
await page.waitForTimeout(3000);

// 检查登录
if (page.url().includes('passport.bilibili.com')) {
  console.log("需要登录B站");
  await page.screenshot({ path: "tmp/bilibili-login-retrieve.png" });
  await client.disconnect();
}

// 视频稿件列表
await page.goto("https://member.bilibili.com/platform/upload-manager/article", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await waitForPageLoad(page);
await page.waitForTimeout(3000);

const posts = await page.evaluate(() => {
  const results = [];
  const items = document.querySelectorAll('[class*="content-item"], [class*="article-item"], tr');
  for (const item of items) {
    const title = item.querySelector('[class*="title"], a')?.textContent?.trim();
    const link = item.querySelector('a[href*="bilibili.com"]');
    const bvLink = item.querySelector('a[href*="/video/BV"]');
    const time = item.querySelector('[class*="time"], [class*="date"]')?.textContent?.trim();
    if (title) {
      results.push({
        title: title.slice(0, 80),
        url: bvLink?.href || link?.href || null,
        publish_time: time || null,
      });
    }
    if (results.length >= 5) break;
  }
  return results;
});

console.log("B站最近发布:", JSON.stringify(posts, null, 2));
await page.screenshot({ path: "tmp/bilibili-posts-list.png" });
await client.disconnect();
```

### 抖音 (Douyin) — 创作者中心作品列表

```typescript
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("post-url-retrieve");
await page.setViewportSize({ width: 1280, height: 800 });

// 抖音创作者中心 - 作品管理
await page.goto("https://creator.douyin.com/creator-micro/content/manage", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await waitForPageLoad(page);
await page.waitForTimeout(3000);

// 检查登录
if (page.url().includes('/login') || page.url().includes('passport')) {
  console.log("需要登录抖音（扫码）");
  await page.screenshot({ path: "tmp/douyin-login-retrieve.png" });
  await client.disconnect();
}

const posts = await page.evaluate(() => {
  const results = [];
  const items = document.querySelectorAll('[class*="content-item"], [class*="video-item"], [class*="card"]');
  for (const item of items) {
    const title = item.querySelector('[class*="title"], [class*="desc"]')?.textContent?.trim();
    const link = item.querySelector('a[href*="douyin.com"]');
    const time = item.querySelector('[class*="time"], [class*="date"]')?.textContent?.trim();
    if (title) {
      results.push({
        title: title.slice(0, 55),
        url: link?.href || null,
        publish_time: time || null,
      });
    }
    if (results.length >= 5) break;
  }
  return results;
});

console.log("抖音最近发布:", JSON.stringify(posts, null, 2));
await page.screenshot({ path: "tmp/douyin-posts-list.png" });
await client.disconnect();
```

### 即刻 (Jike) — 个人页最新动态

```typescript
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("post-url-retrieve");
await page.setViewportSize({ width: 1280, height: 800 });

// 即刻个人页
await page.goto("https://web.okjike.com/me", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await waitForPageLoad(page);
await page.waitForTimeout(3000);

// 检查登录
const needsLogin = await page.evaluate(() => {
  return !!document.querySelector('[class*="login"]') || document.body.innerText.includes('登录');
});
if (needsLogin) {
  console.log("需要登录即刻");
  await page.screenshot({ path: "tmp/jike-login-retrieve.png" });
  await client.disconnect();
}

const posts = await page.evaluate(() => {
  const results = [];
  // 即刻个人页的动态列表
  const links = document.querySelectorAll('a[href*="/post/"], a[href*="/originalPost/"]');
  const seen = new Set();
  for (const link of links) {
    const url = link.href;
    if (seen.has(url)) continue;
    seen.add(url);

    // 尝试获取动态文字
    const parent = link.closest('[class*="item"], [class*="card"], article');
    const text = parent?.textContent?.trim().slice(0, 100) || '';

    results.push({
      title: text,
      url: url,
      publish_time: null,
    });
    if (results.length >= 5) break;
  }
  return results;
});

console.log("即刻最近动态:", JSON.stringify(posts, null, 2));
await page.screenshot({ path: "tmp/jike-posts-list.png" });
await client.disconnect();
```

### 微信公众号 (WeChat) — 草稿箱/已发布

```typescript
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("post-url-retrieve");
await page.setViewportSize({ width: 1280, height: 800 });

// 微信公众号后台 - 已发表
await page.goto("https://mp.weixin.qq.com/cgi-bin/appmsgpublish?sub=list&begin=0&count=10&t=manage/post_list_page", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await waitForPageLoad(page);
await page.waitForTimeout(3000);

// 检查登录
if (page.url().includes('/login') || page.url().includes('safe/')) {
  console.log("需要登录微信公众号（扫码）");
  await page.screenshot({ path: "tmp/wechat-login-retrieve.png" });
  await client.disconnect();
}

// 使用 ARIA snapshot 发现元素（公众号后台页面结构复杂）
const snapshot = await client.getAISnapshot("post-url-retrieve");
console.log(snapshot);

// 查找已发表文章列表
const posts = await page.evaluate(() => {
  const results = [];
  const items = document.querySelectorAll('[class*="article"], [class*="appmsg"]');
  for (const item of items) {
    const title = item.querySelector('[class*="title"]')?.textContent?.trim();
    const link = item.querySelector('a');
    if (title) {
      results.push({
        title: title.slice(0, 50),
        url: link?.href || null,
        publish_time: null,
      });
    }
    if (results.length >= 5) break;
  }
  return results;
});

console.log("公众号最近发布:", JSON.stringify(posts, null, 2));
await page.screenshot({ path: "tmp/wechat-posts-list.png" });
await client.disconnect();
```

---

## 批量获取多平台 URL

```typescript
// 依次获取各平台的最近发布 URL
const PLATFORMS = ["xhs", "bilibili", "douyin"];
const allResults: Record<string, any[]> = {};

for (const platform of PLATFORMS) {
  console.log(`\n▶️ 获取 ${platform} 最近发布...`);
  // 调用对应平台的获取逻辑
  // allResults[platform] = posts;
  await new Promise(r => setTimeout(r, 3000)); // 平台间延迟
}

// 输出汇总结果
const output = {
  timestamp: new Date().toISOString(),
  results: Object.entries(allResults).map(([platform, posts]) => ({
    platform,
    posts,
  })),
};

// 写入文件
import fs from "fs";
fs.writeFileSync("tmp/post-urls.json", JSON.stringify(output, null, 2));
console.log("\n结果已保存到 tmp/post-urls.json");
```

---

## 各平台管理页 URL 速查

| 平台 | 管理页 URL | 说明 |
|------|-----------|------|
| 小红书 | `creator.xiaohongshu.com/creator/notes` | 笔记管理 |
| B站（视频） | `member.bilibili.com/platform/upload-manager/article` | 稿件管理 |
| B站（专栏） | `member.bilibili.com/platform/upload-manager/text/draft` | 专栏管理 |
| 抖音 | `creator.douyin.com/creator-micro/content/manage` | 作品管理 |
| 即刻 | `web.okjike.com/me` | 个人页（最新动态） |
| 微信公众号 | `mp.weixin.qq.com` → 已发表 | 公众号后台 |

## 帖子 URL 格式

| 平台 | URL 格式 |
|------|---------|
| 小红书 | `https://www.xiaohongshu.com/explore/{note_id}` |
| B站（视频） | `https://www.bilibili.com/video/{bvid}` |
| B站（专栏） | `https://www.bilibili.com/read/cv{article_id}` |
| 抖音 | `https://www.douyin.com/video/{video_id}` |
| 即刻 | `https://web.okjike.com/originalPost/{post_id}` |
| 微信公众号 | `https://mp.weixin.qq.com/s/{article_hash}` |

---

## 风控注意

- 操作间 `waitForTimeout(1000-3000)` 随机延迟
- 只读操作，不修改任何内容
- 各平台需要独立检查登录状态
- 遇验证码 → 截图通知用户手动处理

---

## 依赖

- infra-browser skill（Playwright 浏览器自动化）
- 各平台账号（已在浏览器中登录）

## 参考

- XHS 创作者中心：`https://creator.xiaohongshu.com/`
- B站 创作中心：`https://member.bilibili.com/`
- 抖音 创作者平台：`https://creator.douyin.com/`
- 即刻 Web：`https://web.okjike.com/`
- 微信公众号后台：`https://mp.weixin.qq.com/`

---

## 验收记录


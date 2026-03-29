---
name: publish-youtube
description: "发布视频到 YouTube。支持长视频和 Shorts，可续传大文件上传。基于 YouTube Data API v3。触发词：发YouTube、YouTube发布、youtube publish、上传YouTube"
---

# YouTube 发布 Skill

基于 **YouTube Data API v3** 的 API 调用 skill。
两种内容类型：**长视频**（常规视频）和 **Shorts**（≤60s 竖屏短视频）。

## 判断内容类型

| 用户给了 | 类型 | 特征 |
|---------|------|------|
| 常规视频 | 长视频 | 任意时长、比例 |
| 竖屏短视频 ≤60s | Shorts | 9:16 + ≤60s + 标题/描述含 `#Shorts` |

---

## 环境变量 & 认证

YouTube API 使用 Google OAuth 2.0 认证。

```bash
# Google OAuth 2.0 Client Credentials
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REFRESH_TOKEN=xxx    # 用于自动刷新 access token
```

**获取方式**：
1. 前往 Google Cloud Console: https://console.cloud.google.com/
2. 创建项目 → **手动启用 YouTube Data API v3**（APIs & Services → Library → 搜索 YouTube Data API v3 → Enable）
3. 创建 OAuth 2.0 Client ID（Web application 类型也可用于 localhost 回调）
4. 在 Authorized redirect URIs 中添加 `http://localhost:17236`
5. 在 OAuth consent screen → Audience 中确保 Publishing status 为 **Production**（Testing 模式仅允许指定测试用户）
6. 首次授权获取 refresh token（需要以下 scope）：
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube.readonly`

### 首次获取 Refresh Token

运行本地 OAuth 授权流程（启动 localhost:17236 回调服务器 → 浏览器打开 Google 授权页 → 用户同意 → 回调交换 code 为 token）：

```bash
tsx tmp/youtube-oauth2.ts
```

⚠️ **注意**：
- redirect URI 必须与 Google Cloud Console 中配置的**完全一致**（包括端口、路径、协议）
- 授权 URL 使用 `prompt=consent&access_type=offline` 确保返回 refresh_token
- Token 保存到 `tmp/youtube-tokens.json`

### 获取 Access Token

```typescript
async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error_description}`);
  }
  return data.access_token;
}
```

**配额**：YouTube Data API 每日 10,000 单位。`videos.insert` 消耗 1600 单位（每天约 6 次上传）。

## 持久化脚本（固定脚本，不要重新生成）

| 类型 | 脚本路径 | 说明 |
|------|---------|------|
| 视频上传 | `scripts/publish-video.ts` | Resumable Upload + 分块 + 缩略图 |

### 使用方式

1. 读取脚本文件
2. 修改脚本顶部的 `POST` 对象
3. 运行:

```bash
cd ~/.claude/skills/infra-browser
PATH="./node_modules/.bin:$PATH" tsx ~/.claude/skills/publish-youtube/scripts/publish-video.ts
```

4. 结果输出到 `tmp/youtube-publish-result.json`

### 加固特性

- **fetchRetry**: API 调用自动重试 3 次（指数退避）
- **Resumable Upload**: 10MB 分块 + 断点续传支持
- **Token 自动刷新**: 从 refresh_token 自动获取 access_token
- **多源凭据**: 优先环境变量 → 降级 youtube-tokens.json → 降级 postudio .env
- **Shorts 自动处理**: isShorts=true 自动添加 #Shorts 标签
- **配额错误处理**: quotaExceeded 时提示等待重置
- **结果 JSON**: 包含 videoId, URL, shortsUrl

> **重要**: 不要重新生成此脚本！如果遇到 bug，直接修改脚本文件本身。

---

# 发布流程（参考）

## Step 1: Resumable Upload（可续传上传）

YouTube 推荐使用 **Resumable Upload** 协议上传视频，支持断点续传。

```typescript
import fs from "fs";

const VIDEO_PATH = "VIDEO_PATH_HERE";
const accessToken = await getAccessToken();
const fileSize = fs.statSync(VIDEO_PATH).size;

const TITLE = "视频标题";
const DESCRIPTION = "视频描述...";
const TAGS = ["标签1", "标签2"];
const CATEGORY_ID = "22"; // 22 = People & Blogs，见下方分类表
const PRIVACY = "private"; // "public" | "unlisted" | "private"
const IS_SHORTS = false;

// 如果是 Shorts，标题或描述需包含 #Shorts
const finalTitle = IS_SHORTS && !TITLE.includes("#Shorts")
  ? `${TITLE} #Shorts`
  : TITLE;

// 1a. 初始化 resumable upload session
const metadata = {
  snippet: {
    title: finalTitle,
    description: DESCRIPTION,
    tags: TAGS,
    categoryId: CATEGORY_ID,
  },
  status: {
    privacyStatus: PRIVACY,
    selfDeclaredMadeForKids: false,
  },
};

const initRes = await fetch(
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": fileSize.toString(),
      "X-Upload-Content-Type": "video/mp4",
    },
    body: JSON.stringify(metadata),
  }
);

if (initRes.status !== 200) {
  const err = await initRes.json();
  throw new Error(`Upload init failed: ${JSON.stringify(err)}`);
}

const uploadUrl = initRes.headers.get("Location")!;
console.log("Resumable upload URL obtained");

// 1b. 上传视频文件（可分块上传以支持断点续传）
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB per chunk
const fileBuffer = fs.readFileSync(VIDEO_PATH);
let bytesUploaded = 0;

while (bytesUploaded < fileSize) {
  const chunkEnd = Math.min(bytesUploaded + CHUNK_SIZE, fileSize);
  const chunk = fileBuffer.slice(bytesUploaded, chunkEnd);

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Length": chunk.length.toString(),
      "Content-Range": `bytes ${bytesUploaded}-${chunkEnd - 1}/${fileSize}`,
      "Content-Type": "video/mp4",
    },
    body: chunk,
  });

  if (uploadRes.status === 200 || uploadRes.status === 201) {
    // 上传完成
    const videoData = await uploadRes.json();
    console.log(`上传完成！视频 ID: ${videoData.id}`);
    console.log(`视频 URL: https://www.youtube.com/watch?v=${videoData.id}`);
    if (IS_SHORTS) {
      console.log(`Shorts URL: https://www.youtube.com/shorts/${videoData.id}`);
    }
    break;
  } else if (uploadRes.status === 308) {
    // 继续上传下一块
    const range = uploadRes.headers.get("Range");
    if (range) {
      bytesUploaded = parseInt(range.split("-")[1]) + 1;
    } else {
      bytesUploaded = chunkEnd;
    }
    const progress = ((bytesUploaded / fileSize) * 100).toFixed(1);
    console.log(`上传进度: ${progress}% (${bytesUploaded}/${fileSize})`);
  } else {
    const err = await uploadRes.text();
    console.log(`上传错误 (HTTP ${uploadRes.status}): ${err}`);
    // 可以从断点续传
    break;
  }
}
```

## Step 2: 断点续传（Resume Interrupted Upload）

如果上传中断，可以从断点继续：

```typescript
async function resumeUpload(uploadUrl: string, accessToken: string, fileSize: number): Promise<number> {
  // 查询已上传的字节数
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Range": `bytes */${fileSize}`,
    },
  });

  if (res.status === 200 || res.status === 201) {
    // 上传已完成
    return fileSize;
  } else if (res.status === 308) {
    const range = res.headers.get("Range");
    if (range) {
      return parseInt(range.split("-")[1]) + 1;
    }
    return 0;
  } else {
    throw new Error(`Resume check failed: HTTP ${res.status}`);
  }
}

// 使用：
// const resumeFrom = await resumeUpload(uploadUrl, accessToken, fileSize);
// 然后从 resumeFrom 字节开始继续上传
```

## Step 3: 设置缩略图（可选）

```typescript
import fs from "fs";

const VIDEO_ID = "上传返回的视频ID";
const THUMBNAIL_PATH = "path/to/thumbnail.jpg";
const accessToken = await getAccessToken();

const thumbnailData = fs.readFileSync(THUMBNAIL_PATH);

const res = await fetch(
  `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${VIDEO_ID}&uploadType=media`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "image/jpeg",
      "Content-Length": thumbnailData.length.toString(),
    },
    body: thumbnailData,
  }
);

const data = await res.json();
if (data.items) {
  console.log("缩略图设置成功");
} else {
  console.log("缩略图设置失败:", data);
}
```

**缩略图要求**：
- 格式：JPEG, PNG, GIF, BMP
- 大小：≤ 2MB
- 分辨率：1280×720（推荐，最低 640×360）
- 比例：16:9
- ⚠️ **频道必须先通过手机号验证**才能上传自定义缩略图，否则 API 返回 403 `forbidden`
- 验证地址：https://www.youtube.com/verify

## Step 4: 查看处理状态

视频上传后需要 YouTube 服务端处理（编码、审核），可查询处理进度：

```typescript
const VIDEO_ID = "上传返回的视频ID";
const accessToken = await getAccessToken();

const res = await fetch(
  `https://www.googleapis.com/youtube/v3/videos?id=${VIDEO_ID}&part=processingDetails,status`,
  {
    headers: { Authorization: `Bearer ${accessToken}` },
  }
);

const data = await res.json();
const video = data.items?.[0];

if (video) {
  console.log("处理状态:", video.processingDetails?.processingStatus);
  console.log("上传状态:", video.status?.uploadStatus);
  console.log("隐私状态:", video.status?.privacyStatus);
}
// processingStatus: "processing" | "succeeded" | "failed" | "terminated"
```

---

# 视频分类 ID

| ID | 分类 | ID | 分类 |
|----|------|----|----- |
| 1 | Film & Animation | 17 | Sports |
| 2 | Autos & Vehicles | 19 | Travel & Events |
| 10 | Music | 20 | Gaming |
| 15 | Pets & Animals | 22 | People & Blogs |
| 17 | Sports | 23 | Comedy |
| 24 | Entertainment | 25 | News & Politics |
| 26 | Howto & Style | 27 | Education |
| 28 | Science & Technology | 29 | Nonprofits & Activism |

默认使用 `22`（People & Blogs）。

---

# 错误处理

## API 错误码

| 错误 | 含义 | 处理 |
|------|------|------|
| `quotaExceeded` | 日配额用完 | 等待次日重置（太平洋时间午夜） |
| `forbidden` | 无权限 | 检查 OAuth scope 是否包含 `youtube.upload` |
| `uploadLimitExceeded` | 上传频率过高 | YouTube 限制每天上传数量 |
| `videoTooLong` | 视频超过 12 小时 | 压缩或裁剪视频 |
| `invalidMetadata` | 元数据格式错误 | 检查标题/描述/标签 |
| `rateLimitExceeded` | API 调用频率过高 | 使用指数退避重试 |

## 配额计算

| 操作 | 配额消耗 |
|------|---------|
| `videos.insert`（上传视频） | 1600 单位 |
| `thumbnails.set`（设置缩略图） | 50 单位 |
| `videos.list`（查询状态） | 1 单位 |
| **每日总额** | **10,000 单位** |

每天可上传约 6 个视频（含缩略图设置和状态查询）。

---

# 平台规格速查

| 项目 | 长视频 | Shorts |
|------|--------|--------|
| API | YouTube Data API v3 | YouTube Data API v3 |
| 时长 | ≤ 12 小时（默认 15min，需验证后扩展） | ≤ 60 秒 |
| 比例 | 16:9（推荐） | 9:16（必须） |
| 分辨率 | 1080p / 4K 推荐 | 1080×1920 推荐 |
| 文件大小 | ≤ 256GB | ≤ 256GB |
| 格式 | MP4, MOV, AVI, WMV, FLV, 3GP 等 | MP4 推荐 |
| 编码 | H.264 + AAC（推荐） | H.264 + AAC |
| 标题 | ≤ 100 字符 | ≤ 100 字符（需含 #Shorts） |
| 描述 | ≤ 5000 字符 | ≤ 5000 字符 |
| 标签 | ≤ 500 字符总长 | 同左 |
| 缩略图 | 1280×720，≤ 2MB | 自动生成（不支持自定义） |
| 隐私 | public / unlisted / private | 同左 |
| 上传方式 | Resumable upload（断点续传） | 同左 |

---

## 依赖

- Node.js（`fetch`，`fs`）
- Google Cloud Project（启用 YouTube Data API v3）
- Google OAuth 2.0 Client Credentials
- 环境变量：`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`

## 参考

- YouTube Data API 文档：`https://developers.google.com/youtube/v3`
- Videos: insert：`https://developers.google.com/youtube/v3/docs/videos/insert`
- Resumable Uploads：`https://developers.google.com/youtube/v3/guides/using_code_samples#uploads`
- 配额计算器：`https://developers.google.com/youtube/v3/determine_quota_cost`

---

## 已知凭据

当前使用 postudio 项目的 Google Cloud OAuth Client：
- **Project**: postudio (ID: 114222289102)
- **Client ID**: `114222289102-tgt2tmgd3qgv02k5qm5pi3od0pcpouse.apps.googleusercontent.com`
- **Client Secret**: 存于 `/Users/marshall/Desktop/postudio/postudio/apps/desktop/.env.local` (`GOOGLE_OAUTH_CLIENT_SECRET`)
- **Refresh Token**: 存于 `tmp/youtube-tokens.json`
- **Redirect URI**: `http://localhost:17236`
- **Authorized Scopes**: `youtube.upload`, `youtube.readonly`

## 验收记录

### 2026-03-08 PM 视频上传测试 ✅
- **视频**: pm-video.mp4 (503.3MB, 11min, H.264 1080p)
- **上传**: Resumable upload, 10MB chunks, 62s, 8.1 MB/s
- **视频 ID**: `rGJw-RvgLJs`
- **URL**: https://www.youtube.com/watch?v=rGJw-RvgLJs
- **隐私**: public
- **缩略图**: ❌ 失败（频道未通过手机验证，API 返回 403）
- **问题记录**:
  1. OAuth redirect_uri_mismatch → URI 必须精确匹配 Google Cloud Console 配置
  2. YouTube Data API v3 未启用 → 需手动在 Google Cloud Console 启用
  3. 缩略图上传需频道手机验证 → https://www.youtube.com/verify

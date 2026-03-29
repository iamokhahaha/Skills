/**
 * YouTube 视频发布脚本（API 直传，Resumable Upload）
 *
 * 用法: 修改 POST 对象后运行
 *   cd ~/.claude/skills/auto-dev-browser
 *   PATH="./node_modules/.bin:$PATH" tsx ~/.claude/skills/media-youtube-publish/scripts/publish-video.ts
 *
 * 前提: 环境变量已配置（GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN）
 *       或 tmp/youtube-tokens.json 包含有效 refresh_token
 */
import * as fs from "fs";
import * as path from "path";

const SCREENSHOT_DIR = "/Users/ayuu/Desktop/zero-code/tmp";

const POST = {
  // ── 素材 ──
  video: "",                // 视频文件路径
  thumbnail: "",            // 缩略图路径（可选，1280×720, ≤2MB, 需频道验证）

  // ── 内容 ──
  title: "",                // 标题（≤ 100 字符）
  description: "",          // 描述（≤ 5000 字符）
  tags: [] as string[],     // 标签（总长 ≤ 500 字符）

  // ── 设置 ──
  categoryId: "28",         // 分类 ID（28=Science & Technology, 22=People & Blogs）
  privacy: "private" as "public" | "unlisted" | "private",
  isShorts: false,          // 是否 Shorts（≤60s 竖屏）
};

// ── OAuth 配置 ──
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "114222289102-tgt2tmgd3qgv02k5qm5pi3od0pcpouse.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || "";

/** 获取 Access Token */
async function getAccessToken(): Promise<string> {
  // 优先从环境变量获取
  let refreshToken = GOOGLE_REFRESH_TOKEN;

  // 降级: 从 tokens 文件读取
  if (!refreshToken) {
    const tokenFile = `${SCREENSHOT_DIR}/youtube-tokens.json`;
    if (fs.existsSync(tokenFile)) {
      const tokens = JSON.parse(fs.readFileSync(tokenFile, "utf-8"));
      refreshToken = tokens.refresh_token;
    }
  }

  if (!refreshToken) {
    throw new Error("缺少 GOOGLE_REFRESH_TOKEN，请先运行 OAuth 授权流程");
  }

  let clientSecret = GOOGLE_CLIENT_SECRET;
  if (!clientSecret) {
    // 尝试从 postudio .env 读取
    const envPath = "/Users/marshall/Desktop/postudio/postudio/apps/desktop/.env.local";
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      const match = envContent.match(/GOOGLE_OAUTH_CLIENT_SECRET=(.+)/);
      if (match) clientSecret = match[1].trim();
    }
  }
  if (!clientSecret) {
    throw new Error("缺少 GOOGLE_CLIENT_SECRET");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error_description || data.error}`);
  }
  return data.access_token;
}

/** 带重试的 fetch */
async function fetchRetry(url: string, opts: RequestInit, retries = 3, label = ""): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok || res.status === 308 || res.status < 500) return res;
      console.log(`  ${label} HTTP ${res.status}, 重试 ${i + 1}/${retries}...`);
    } catch (e: any) {
      console.log(`  ${label} 网络错误: ${e.message}, 重试 ${i + 1}/${retries}...`);
    }
    await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
  }
  throw new Error(`${label} 失败，已重试 ${retries} 次`);
}

async function main() {
  // ── 验证输入 ──
  if (!POST.video || !fs.existsSync(POST.video)) { console.log("ERROR: 视频文件不存在"); process.exit(1); }
  if (!POST.title) { console.log("ERROR: 标题不能为空"); process.exit(1); }

  const fileSize = fs.statSync(POST.video).size;
  const fileName = path.basename(POST.video);
  console.log(`视频: ${fileName} (${(fileSize / 1024 / 1024).toFixed(1)}MB)`);

  // ── Step 1: 获取 Access Token ──
  console.log("Step 1: 获取 Access Token...");
  const accessToken = await getAccessToken();
  console.log("  Token OK");

  // ── Step 2: 初始化 Resumable Upload ──
  console.log("Step 2: 初始化上传...");
  const finalTitle = POST.isShorts && !POST.title.includes("#Shorts")
    ? `${POST.title} #Shorts`
    : POST.title;

  const metadata = {
    snippet: {
      title: finalTitle.slice(0, 100),
      description: POST.description.slice(0, 5000),
      tags: POST.tags,
      categoryId: POST.categoryId,
    },
    status: {
      privacyStatus: POST.privacy,
      selfDeclaredMadeForKids: false,
    },
  };

  const initRes = await fetchRetry(
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
    },
    3, "init",
  );

  if (initRes.status !== 200) {
    const err = await initRes.json();
    console.log("ERROR: 上传初始化失败:", JSON.stringify(err));
    if (err.error?.errors?.[0]?.reason === "quotaExceeded") {
      console.log("  每日配额已用完，请等待太平洋时间午夜重置");
    }
    process.exit(1);
  }

  const uploadUrl = initRes.headers.get("Location")!;
  console.log("  Upload URL 已获取");

  // ── Step 3: 分块上传 ──
  console.log("Step 3: 上传视频...");
  const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
  const fileBuffer = fs.readFileSync(POST.video);
  let bytesUploaded = 0;
  let videoId = "";

  while (bytesUploaded < fileSize) {
    const chunkEnd = Math.min(bytesUploaded + CHUNK_SIZE, fileSize);
    const chunk = fileBuffer.slice(bytesUploaded, chunkEnd);

    const uploadRes = await fetchRetry(
      uploadUrl,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Length": chunk.length.toString(),
          "Content-Range": `bytes ${bytesUploaded}-${chunkEnd - 1}/${fileSize}`,
          "Content-Type": "video/mp4",
        },
        body: chunk,
      },
      3, `chunk ${Math.floor(bytesUploaded / CHUNK_SIZE) + 1}`,
    );

    if (uploadRes.status === 200 || uploadRes.status === 201) {
      const videoData = await uploadRes.json();
      videoId = videoData.id;
      console.log(`  上传完成！视频 ID: ${videoId}`);
      break;
    } else if (uploadRes.status === 308) {
      const range = uploadRes.headers.get("Range");
      bytesUploaded = range ? parseInt(range.split("-")[1]) + 1 : chunkEnd;
      const pct = ((bytesUploaded / fileSize) * 100).toFixed(1);
      if (parseInt(pct) % 10 < 2) console.log(`  [${pct}%] ${(bytesUploaded / 1024 / 1024).toFixed(0)}MB / ${(fileSize / 1024 / 1024).toFixed(0)}MB`);
    } else {
      const err = await uploadRes.text();
      console.log(`  ERROR: HTTP ${uploadRes.status}: ${err}`);
      break;
    }
  }

  if (!videoId) {
    console.log("ERROR: 上传未完成");
    fs.writeFileSync(`${SCREENSHOT_DIR}/youtube-publish-result.json`, JSON.stringify({
      success: false, error: "upload incomplete", uploadUrl, timestamp: new Date().toISOString(),
    }, null, 2));
    process.exit(1);
  }

  // ── Step 4: 设置缩略图（可选） ──
  let thumbnailSet = false;
  if (POST.thumbnail && fs.existsSync(POST.thumbnail)) {
    console.log("Step 4: 设置缩略图...");
    const thumbData = fs.readFileSync(POST.thumbnail);
    try {
      const thumbRes = await fetchRetry(
        `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "image/jpeg",
            "Content-Length": thumbData.length.toString(),
          },
          body: thumbData,
        },
        2, "thumbnail",
      );
      const thumbResult = await thumbRes.json();
      if (thumbResult.items) {
        thumbnailSet = true;
        console.log("  缩略图已设置");
      } else {
        console.log("  WARNING: 缩略图设置失败（可能需要频道手机验证）");
      }
    } catch (e: any) {
      console.log("  WARNING: 缩略图设置失败:", e.message);
    }
  }

  // ── 结果 ──
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const shortsUrl = POST.isShorts ? `https://www.youtube.com/shorts/${videoId}` : "";

  console.log("PUBLISH SUCCESS!");
  console.log(`  视频 ID: ${videoId}`);
  console.log(`  视频 URL: ${videoUrl}`);
  if (shortsUrl) console.log(`  Shorts URL: ${shortsUrl}`);
  console.log(`  隐私: ${POST.privacy}`);
  console.log("  注意: 视频处理需要几分钟到几小时");

  fs.writeFileSync(`${SCREENSHOT_DIR}/youtube-publish-result.json`, JSON.stringify({
    success: true,
    videoId,
    url: videoUrl,
    shortsUrl,
    title: POST.title,
    privacy: POST.privacy,
    thumbnailSet,
    timestamp: new Date().toISOString(),
  }, null, 2));
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  fs.writeFileSync(`${SCREENSHOT_DIR}/youtube-publish-result.json`, JSON.stringify({
    success: false, error: e.message, timestamp: new Date().toISOString(),
  }, null, 2));
  process.exit(1);
});

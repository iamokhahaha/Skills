/**
 * B站视频投稿脚本（API 直传）
 *
 * 用法: 先生成 JSON 数据文件，然后运行脚本
 *   npx tsx publish-video.ts <json-path>
 *
 * JSON 格式:
 *   { video, cover?, title, desc, tags[], tid?, copyright?, source?, dtime? }
 *
 * 前提: infra-browser server 已启动，B站已登录
 */
import { connect } from "@/client.js";
import * as fs from "fs";
import * as path from "path";

const SCREENSHOT_DIR = "/Users/ayuu/Desktop/zero-code/tmp";

// ── 从 JSON 文件读取发布数据 ──
const jsonPath = process.argv[2];
if (!jsonPath || !fs.existsSync(jsonPath)) {
  console.error("用法: npx tsx publish-video.ts <json-path>");
  console.error("  JSON 必须包含: video, title, desc");
  process.exit(1);
}
const POST = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as {
  video: string;
  cover?: string;
  title: string;
  desc: string;
  tags?: string[];
  tid?: number;
  copyright?: number;
  source?: string;
  dtime?: number;
};
POST.tags = POST.tags ?? [];
POST.tid = POST.tid ?? 201;
POST.copyright = POST.copyright ?? 1;
POST.source = POST.source ?? "";
POST.dtime = POST.dtime ?? 0;

// ── 常用分区 ID ──
// 122=野生技术协会  124=社科·法律·心理  188=计算机技术
// 201=科学科普  208=人文历史  231=计算机技术（新）

/** 带重试的 fetch */
async function fetchRetry(
  url: string,
  opts: RequestInit,
  retries = 3,
  label = "request",
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok || res.status < 500) return res;
      console.log(`  ${label} HTTP ${res.status}, 重试 ${i + 1}/${retries}...`);
    } catch (e: any) {
      console.log(`  ${label} 网络错误: ${e.message}, 重试 ${i + 1}/${retries}...`);
    }
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  throw new Error(`${label} 失败，已重试 ${retries} 次`);
}

async function main() {
  // ── 验证输入 ──
  if (!POST.video || !fs.existsSync(POST.video)) {
    console.log("ERROR: 视频文件不存在:", POST.video);
    process.exit(1);
  }
  if (!POST.title) {
    console.log("ERROR: 标题不能为空");
    process.exit(1);
  }
  if (POST.title.length > 80) {
    console.log(`WARNING: 标题超过80字(${POST.title.length}字)，将截断`);
  }

  const fileSize = fs.statSync(POST.video).size;
  const fileName = path.basename(POST.video);
  console.log(`视频: ${fileName} (${(fileSize / 1024 / 1024).toFixed(1)}MB)`);

  // ── Step 1: 从 dev-browser 获取 Cookies ──
  console.log("Step 1: 获取登录 Cookies...");
  const client = await connect();
  const page = await client.page("bilibili-publish");
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto("https://www.bilibili.com/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  // 检查登录状态
  const loggedIn = await page.evaluate(() => {
    const loginBtn = document.querySelector('.header-login-entry, [class*="login-btn"]');
    const userMenu = document.querySelector('.header-avatar-wrap, [class*="header-entry-avatar"]');
    return !loginBtn && !!userMenu;
  });

  if (!loggedIn) {
    console.log("NEEDS_LOGIN: 请在浏览器中登录B站");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/bilibili-login.png` });
    // 等待登录（最多5分钟）
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(5000);
      const nowLoggedIn = await page.evaluate(() => {
        const loginBtn = document.querySelector('.header-login-entry, [class*="login-btn"]');
        return !loginBtn;
      });
      if (nowLoggedIn) break;
      if (i === 59) {
        console.log("登录超时，退出");
        await client.disconnect();
        process.exit(1);
      }
    }
    // 刷新获取 cookies
    await page.goto("https://www.bilibili.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
  }

  // 提取 cookies
  const cookies = await page.context().cookies();
  const biliCookies = cookies.filter((c) => c.domain.includes("bilibili"));
  const cookieStr = biliCookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const SESSDATA = biliCookies.find((c) => c.name === "SESSDATA")?.value;
  const bili_jct = biliCookies.find((c) => c.name === "bili_jct")?.value;

  if (!SESSDATA || !bili_jct) {
    console.log("ERROR: 缺少关键 Cookies (SESSDATA/bili_jct)");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/bilibili-cookie-error.png` });
    await client.disconnect();
    process.exit(1);
  }
  console.log("  Cookies OK (SESSDATA + bili_jct)");
  await client.disconnect();

  const headers = { Cookie: cookieStr };

  // ── Step 2: Preupload ──
  console.log("Step 2: 获取上传地址...");
  // ⚠️ profile 必须是 ugcupos/bup（不是 ugcfx/bup，否则 init 返回 400）
  const preuploadUrl = `https://member.bilibili.com/preupload?name=${encodeURIComponent(fileName)}&size=${fileSize}&r=upos&profile=ugcupos%2Fbup&ssl=0&version=2.8.12&build=2081200`;

  const preRes = await fetchRetry(preuploadUrl, { headers }, 3, "preupload");
  const preData = await preRes.json();

  if (!preData.OK && preData.OK !== 1) {
    console.log("ERROR: preupload 失败:", JSON.stringify(preData));
    process.exit(1);
  }
  console.log("  上传地址:", preData.endpoint);

  // ── Step 3: Init Upload ──
  console.log("Step 3: 初始化上传...");
  const uposUri = preData.upos_uri.replace("upos://", "");
  const baseUrl = "https:" + preData.endpoint;
  const auth = preData.auth;

  const initRes = await fetchRetry(
    `${baseUrl}/${uposUri}?uploads&output=json`,
    { method: "POST", headers: { "X-Upos-Auth": auth } },
    3,
    "init",
  );
  const { upload_id } = await initRes.json();
  console.log("  upload_id:", upload_id);

  // ── Step 4: 分片上传 ──
  console.log("Step 4: 分片上传...");
  const chunkSize = preData.chunk_size || 10 * 1024 * 1024; // 默认 10MB
  const totalChunks = Math.ceil(fileSize / chunkSize);
  console.log(`  共 ${totalChunks} 个分片 (每片 ${(chunkSize / 1024 / 1024).toFixed(0)}MB)`);

  const fd = fs.openSync(POST.video, "r");
  const buffer = Buffer.alloc(chunkSize);

  for (let i = 0; i < totalChunks; i++) {
    const offset = i * chunkSize;
    const bytesRead = fs.readSync(fd, buffer, 0, chunkSize, offset);
    const chunk = buffer.subarray(0, bytesRead);

    const chunkUrl = `${baseUrl}/${uposUri}?partNumber=${i + 1}&uploadId=${upload_id}&chunk=${i}&chunks=${totalChunks}&size=${bytesRead}&start=${offset}&end=${offset + bytesRead}&total=${fileSize}`;

    await fetchRetry(
      chunkUrl,
      {
        method: "PUT",
        headers: { "X-Upos-Auth": auth, "Content-Type": "application/octet-stream" },
        body: chunk,
      },
      3,
      `chunk ${i + 1}/${totalChunks}`,
    );

    const pct = (((i + 1) / totalChunks) * 100).toFixed(0);
    if (totalChunks <= 10 || (i + 1) % 5 === 0 || i === totalChunks - 1) {
      console.log(`  [${pct}%] ${i + 1}/${totalChunks}`);
    }
  }
  fs.closeSync(fd);
  console.log("  所有分片上传完成");

  // ── Step 5: Complete Upload ──
  console.log("Step 5: 完成上传...");
  const parts = Array.from({ length: totalChunks }, (_, i) => ({
    partNumber: i + 1,
    eTag: "etag",
  }));
  const completeUrl = `${baseUrl}/${uposUri}?output=json&name=${encodeURIComponent(fileName)}&profile=ugcupos%2Fbup&uploadId=${upload_id}&biz_id=${preData.biz_id}`;

  const completeRes = await fetchRetry(
    completeUrl,
    {
      method: "POST",
      headers: { "X-Upos-Auth": auth, "Content-Type": "application/json" },
      body: JSON.stringify({ parts }),
    },
    3,
    "complete",
  );
  const completeData = await completeRes.json();

  if (completeData.OK !== 1) {
    console.log("ERROR: complete 失败:", JSON.stringify(completeData));
    process.exit(1);
  }
  const biliFilename = uposUri.split("/").pop()?.replace(".mp4", "") || "";
  console.log("  文件名:", biliFilename);

  // ── Step 6: 上传封面（可选） ──
  let coverUrl = "";
  if (POST.cover && fs.existsSync(POST.cover)) {
    console.log("Step 6: 上传封面...");
    const coverBytes = fs.readFileSync(POST.cover);
    const coverExt = POST.cover.toLowerCase().endsWith(".jpg") || POST.cover.toLowerCase().endsWith(".jpeg") ? "jpeg" : "png";
    const coverMime = `image/${coverExt}`;
    const coverForm = new FormData();
    coverForm.append("file", new Blob([coverBytes], { type: coverMime }), `cover.${coverExt}`);
    coverForm.append("csrf", bili_jct);

    const coverRes = await fetchRetry(
      "https://member.bilibili.com/x/vu/web/cover/up",
      { method: "POST", headers: { Cookie: cookieStr }, body: coverForm },
      3,
      "cover",
    );
    const coverData = await coverRes.json();
    if (coverData.code === 0 && coverData.data?.url) {
      coverUrl = coverData.data.url;
      console.log("  封面 URL:", coverUrl);
    } else {
      console.log("  WARNING: 封面上传失败:", JSON.stringify(coverData));
    }
  } else {
    console.log("Step 6: 跳过封面（将自动截帧）");
  }

  // ── Step 7: 提交投稿 ──
  console.log("Step 7: 提交投稿...");
  const submitData = {
    copyright: POST.copyright,
    videos: [{ filename: biliFilename, title: "", desc: "", cid: 0 }],
    source: POST.source,
    tid: POST.tid,
    cover: coverUrl,
    title: POST.title.slice(0, 80),
    desc_format_id: 0,
    desc: POST.desc.slice(0, 2000),
    dynamic: "",
    subtitle: { open: 0, lan: "" },
    tag: POST.tags
      .slice(0, 10)
      .map((t) => t.slice(0, 20))
      .join(","),
    dtime: POST.dtime,
    open_elec: 0,
    no_reprint: 1,
    mission_id: 0,
    dolby: 0,
    lossless_music: 0,
    up_selection_reply: false,
    up_close_reply: false,
    up_close_danmu: false,
    web_os: 1,
  };

  const submitRes = await fetchRetry(
    `https://member.bilibili.com/x/vu/web/add?csrf=${bili_jct}`,
    {
      method: "POST",
      headers: {
        Cookie: cookieStr,
        "Content-Type": "application/json",
        Referer: "https://member.bilibili.com/platform/upload/video/frame",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Origin: "https://member.bilibili.com",
      },
      body: JSON.stringify(submitData),
    },
    3,
    "submit",
  );
  const result = await submitRes.json();

  // ── 结果 ──
  const success = result.code === 0;
  const bvid = result.data?.bvid || "";
  const aid = result.data?.aid || "";

  if (success) {
    console.log("PUBLISH SUCCESS!");
    console.log(`  BV号: ${bvid}`);
    console.log(`  AV号: ${aid}`);
    console.log(`  链接: https://www.bilibili.com/video/${bvid}`);
    console.log("  注意: 视频审核通常需要 1-24 小时");
  } else {
    console.log("PUBLISH FAILED!");
    console.log(`  code: ${result.code}`);
    console.log(`  message: ${result.message}`);
  }

  fs.writeFileSync(
    `${SCREENSHOT_DIR}/bilibili-publish-result.json`,
    JSON.stringify(
      {
        success,
        bvid,
        aid,
        url: bvid ? `https://www.bilibili.com/video/${bvid}` : "",
        title: POST.title,
        code: result.code,
        message: result.message || "",
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  fs.writeFileSync(
    `${SCREENSHOT_DIR}/bilibili-publish-result.json`,
    JSON.stringify({
      success: false,
      error: e.message,
      timestamp: new Date().toISOString(),
    }, null, 2),
  );
  process.exit(1);
});

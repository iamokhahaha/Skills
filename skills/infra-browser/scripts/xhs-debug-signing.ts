/**
 * Debug: Compare our signing output with what XHS's own SDK generates
 */
import { chromium } from "playwright";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, "..", "profiles", "browser-data");
const TMP = join(__dirname, "..", "tmp");
const STEALTH_JS = join(__dirname, "stealth.min.js");

const BASE64_CHARS = "ZmserbBoHQtNP+wOcza/LpngG8yJq42KWYj0DSfdikx3VT16IlUAFM97hECvuRX5";
const STD_BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function customB64Encode(input: string): string {
  const buf = Buffer.from(input, "utf-8");
  const std = buf.toString("base64").replace(/=+$/, "");
  let result = "";
  for (const ch of std) {
    const idx = STD_BASE64.indexOf(ch);
    result += idx >= 0 ? BASE64_CHARS[idx] : ch;
  }
  return result;
}

function mrc(input: string): number {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table.push(c >>> 0);
  }
  let crc = 0xFFFFFFFF;
  const str = input.substring(0, 57);
  for (let i = 0; i < str.length; i++) {
    crc = (table[(crc ^ str.charCodeAt(i)) & 0xFF]! ^ (crc >>> 8)) >>> 0;
  }
  return ((crc ^ 0xFFFFFFFF) ^ 3988292384) >>> 0;
}

async function main() {
  fs.mkdirSync(TMP, { recursive: true });
  const stealthJs = fs.readFileSync(STEALTH_JS, "utf-8");

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();
  await page.addInitScript(stealthJs);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto("https://www.xiaohongshu.com/explore", { timeout: 60000, waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 8000));

  // Get cookies
  const cookies = await context.cookies(["https://www.xiaohongshu.com"]);
  const a1 = cookies.find(c => c.name === "a1")?.value || "";
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  const b1 = await page.evaluate(() => {
    try { return localStorage.getItem("b1") || ""; } catch { return ""; }
  });

  console.log(`a1: ${a1.substring(0, 20)}`);
  console.log(`b1: ${b1.substring(0, 20)}`);

  // Test URI
  const noteId = "69a1c16f000000002800ab0d";
  const uri = `/api/sns/web/v2/comment/page?note_id=${noteId}&cursor=&image_formats=webp`;
  const signStr = uri;
  const md5Str = crypto.createHash("md5").update(signStr).digest("hex");

  console.log(`\nURI: ${uri}`);
  console.log(`MD5: ${md5Str}`);

  // Call mnsv2
  const mnsv2Result = await page.evaluate(
    ({ s, m }) => {
      const w = window as any;
      return w.mnsv2(s, m);
    },
    { s: signStr, m: md5Str },
  );
  console.log(`mnsv2 result: ${mnsv2Result?.substring(0, 80)}...`);
  console.log(`mnsv2 length: ${mnsv2Result?.length}`);

  // Build our x-s
  const xt = String(Date.now());
  const xsPayload = JSON.stringify({
    x0: "4.2.1",
    x1: "xhs-pc-web",
    x2: "Mac OS",
    x3: mnsv2Result,
    x4: "object",
  });
  const xs = "XYS_" + customB64Encode(xsPayload);

  console.log(`\nOur x-s: ${xs.substring(0, 80)}...`);
  console.log(`Our x-t: ${xt}`);

  // Build x-s-common
  const xsCommonPayload = JSON.stringify({
    s0: 3, s1: "",
    x0: "1", x1: "4.2.2", x2: "Mac OS", x3: "xhs-pc-web", x4: "4.74.0",
    x5: a1, x6: xt, x7: xs, x8: b1,
    x9: mrc(xt + xs + b1), x10: 154, x11: "normal",
  });
  const xsCommon = customB64Encode(xsCommonPayload);
  console.log(`Our x-s-common: ${xsCommon.substring(0, 80)}...`);

  // Now capture what XHS's OWN SDK sends for comparison
  console.log("\n=== Capturing XHS SDK headers for comparison ===");

  // Hook XHR to capture next request's headers
  const sdkHeaders = await page.evaluate(async () => {
    return new Promise<any>((resolve) => {
      const origSend = XMLHttpRequest.prototype.send;
      const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
      const headers: Record<string, string> = {};
      let captured = false;

      XMLHttpRequest.prototype.setRequestHeader = function(name: string, value: string) {
        if (!captured) headers[name] = value;
        return origSetHeader.apply(this, [name, value]);
      };

      XMLHttpRequest.prototype.send = function(body?: any) {
        if (!captured && Object.keys(headers).length > 3) {
          captured = true;
          XMLHttpRequest.prototype.send = origSend;
          XMLHttpRequest.prototype.setRequestHeader = origSetHeader;
          setTimeout(() => resolve(headers), 100);
        }
        return origSend.apply(this, [body]);
      };

      // Trigger a scroll to cause XHS to make an API call
      window.scrollBy(0, 500);
      setTimeout(() => {
        window.scrollBy(0, 500);
        setTimeout(() => resolve(headers), 5000);
      }, 2000);
    });
  });

  console.log("SDK headers captured:");
  for (const [k, v] of Object.entries(sdkHeaders)) {
    if (k.toLowerCase().startsWith("x-") || k.toLowerCase() === "content-type") {
      console.log(`  ${k}: ${String(v).substring(0, 80)}`);
    }
  }

  // Compare x-s format
  const sdkXs = sdkHeaders["X-s"] || sdkHeaders["x-s"] || "";
  console.log(`\nSDK x-s starts with: ${String(sdkXs).substring(0, 10)}`);
  console.log(`Our x-s starts with: ${xs.substring(0, 10)}`);

  // Now make the API call with our headers
  console.log("\n=== Testing API call ===");
  const traceId = crypto.randomBytes(8).toString("hex");
  const res = await fetch(`https://edith.xiaohongshu.com${uri}`, {
    headers: {
      "x-s": xs,
      "x-t": xt,
      "x-s-common": xsCommon,
      "x-b3-traceid": traceId,
      "cookie": cookieString,
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      "referer": "https://www.xiaohongshu.com/",
      "origin": "https://www.xiaohongshu.com",
      "accept": "application/json, text/plain, */*",
    },
  });

  console.log(`Status: ${res.status}`);
  const body = await res.text();
  console.log(`Body: ${body.substring(0, 500)}`);

  // Also try with SDK headers directly
  if (sdkXs) {
    console.log("\n=== Testing with SDK headers ===");
    const sdkXt = sdkHeaders["X-t"] || sdkHeaders["x-t"] || xt;
    const sdkXsCommon = sdkHeaders["X-S-Common"] || sdkHeaders["x-s-common"] || "";

    const res2 = await fetch(`https://edith.xiaohongshu.com${uri}`, {
      headers: {
        "x-s": String(sdkXs),
        "x-t": String(sdkXt),
        "x-s-common": String(sdkXsCommon),
        "x-b3-traceid": traceId,
        "cookie": cookieString,
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        "referer": "https://www.xiaohongshu.com/",
        "origin": "https://www.xiaohongshu.com",
        "accept": "application/json, text/plain, */*",
      },
    });

    console.log(`Status: ${res2.status}`);
    const body2 = await res2.text();
    console.log(`Body: ${body2.substring(0, 500)}`);
  }

  await context.close();
}

main().catch(console.error);

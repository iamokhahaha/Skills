/**
 * Test comment API with fresh cookies (after re-login)
 */
import { chromium } from "playwright";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, "..", "profiles", "browser-data");
const TMP = join(__dirname, "..", "tmp");

const CUSTOM_ALPHABET = "A4NjFqYu5wPHsO0XTdDgMa2r1ZQocVte9UJBvk6/7=yRnhISGKblCWi+LpfE8xzm3";
const STANDARD_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

function customBase64Encode(input: string): string {
  const base64 = Buffer.from(input).toString("base64");
  let result = "";
  for (const ch of base64) {
    const idx = STANDARD_ALPHABET.indexOf(ch);
    result += idx >= 0 ? CUSTOM_ALPHABET[idx] : ch;
  }
  return result;
}

function sign(uri: string): { "x-s": string; "x-t": string } {
  const timestamp = String(Date.now());
  const payload = `${timestamp}test${uri}`;
  const md5 = crypto.createHash("md5").update(payload).digest("hex");
  const xs = customBase64Encode(md5);
  return { "x-s": xs, "x-t": timestamp };
}

async function main() {
  fs.mkdirSync(TMP, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
  });

  const page = await context.newPage();

  // Go to main site briefly to ensure cookies are set
  await page.goto("https://www.xiaohongshu.com");
  await new Promise(r => setTimeout(r, 3000));

  const cookies = await context.cookies(["https://www.xiaohongshu.com", "https://edith.xiaohongshu.com"]);
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  const a1 = cookies.find(c => c.name === "a1")?.value || "";
  console.log(`a1: ${a1.substring(0, 20)}...`);
  console.log(`Total cookies: ${cookies.length}`);

  await context.close();

  // Test API directly
  const noteId = "69a1c16f000000002800ab0d";
  const uri = `/api/sns/web/v2/comment/page?note_id=${noteId}&cursor=&image_formats=webp`;
  const headers = sign(uri);

  console.log("\n=== Test: Direct API with fresh cookies + signing ===");
  const res = await fetch(`https://edith.xiaohongshu.com${uri}`, {
    headers: {
      ...headers,
      "cookie": cookieString,
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      "referer": "https://www.xiaohongshu.com/",
      "origin": "https://www.xiaohongshu.com",
      "accept": "application/json, text/plain, */*",
    },
  });

  console.log(`Status: ${res.status}`);
  const body = await res.text();
  console.log(`Body: ${body.substring(0, 1000)}`);
  fs.writeFileSync(`${TMP}/xhs-fresh-cookie-test.json`, body);

  // Also test without signing
  console.log("\n=== Test: Fresh cookies WITHOUT signing ===");
  const res2 = await fetch(`https://edith.xiaohongshu.com${uri}`, {
    headers: {
      "cookie": cookieString,
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      "referer": "https://www.xiaohongshu.com/",
      "origin": "https://www.xiaohongshu.com",
    },
  });
  console.log(`Status: ${res2.status}`);
  console.log(`Body: ${(await res2.text()).substring(0, 500)}`);
}

main().catch(console.error);

import { chromium } from "playwright";
import * as fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, "..", "profiles", "browser-data");

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false, channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
  });
  const page = await context.newPage();
  await page.goto("https://www.xiaohongshu.com");
  await new Promise(r => setTimeout(r, 3000));
  const cookies = await context.cookies(["https://www.xiaohongshu.com", "https://edith.xiaohongshu.com"]);
  const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  fs.writeFileSync("tmp/xhs-cookies.txt", cookieStr);
  console.log(`Saved ${cookies.length} cookies`);
  await context.close();
}

main().catch(console.error);

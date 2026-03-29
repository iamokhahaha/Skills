import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("xhs-publish");
await page.setViewportSize({ width: 1280, height: 800 });

await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await waitForPageLoad(page);

const needsLogin = page.url().includes("/login");
console.log({ needsLogin, url: page.url() });

if (needsLogin) {
  console.log("请在浏览器中扫码登录小红书");
  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-login.png" });
}
await client.disconnect();

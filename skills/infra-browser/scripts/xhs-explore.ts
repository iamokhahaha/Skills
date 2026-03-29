import { connect, waitForPageLoad } from "@/client.js";

async function main() {
  const client = await connect();
  const page = await client.page("xhs-publish");

  // Check current URL
  console.log("Current URL:", page.url());

  // Navigate to publish page
  await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await waitForPageLoad(page);

  // Wait more for React to render
  console.log("Waiting for React to render...");
  await page.waitForTimeout(5000);

  // Check URL after load
  console.log("URL after load:", page.url());

  // Look for upload area indicators
  const pageStructure = await page.evaluate(() => {
    const result: Record<string, string> = {};

    // Check for upload-related elements
    const fileInputs = document.querySelectorAll('input[type="file"]');
    result.fileInputs = `${fileInputs.length} found`;
    fileInputs.forEach((el, i) => {
      const inp = el as HTMLInputElement;
      result[`input_${i}`] = `accept=${inp.accept}, class=${inp.className}, visible=${inp.offsetParent !== null}`;
    });

    // Check for upload area
    const uploadArea = document.querySelector('.upload-content, .upload-input, [class*="upload"]');
    result.uploadArea = uploadArea ? `found: ${uploadArea.className}` : 'not found';

    // Check for tabs
    const tabs = document.querySelectorAll('.creator-tab, [class*="tab"]');
    result.tabs = `${tabs.length} tabs found`;
    tabs.forEach((t, i) => {
      result[`tab_${i}`] = (t as HTMLElement).textContent?.trim() || '';
    });

    // Check for loading state
    const skeletons = document.querySelectorAll('[class*="skeleton"], [class*="loading"], [class*="placeholder"]');
    result.loadingElements = `${skeletons.length} skeleton/loading elements`;

    // Check body text excerpt
    const bodyText = document.body.innerText.slice(0, 500);
    result.bodyTextExcerpt = bodyText;

    return result;
  });

  console.log("\n=== Page Structure ===");
  for (const [key, value] of Object.entries(pageStructure)) {
    console.log(`${key}: ${value}`);
  }

  // Wait 5 more seconds and check again
  await page.waitForTimeout(5000);

  const retry = await page.evaluate(() => {
    const fileInputs = document.querySelectorAll('input[type="file"]');
    const uploadArea = document.querySelector('.upload-content, .upload-input, [class*="upload"]');
    const tabs = document.querySelectorAll('.creator-tab, [class*="tab"]');
    return {
      fileInputs: fileInputs.length,
      uploadArea: uploadArea ? uploadArea.className : null,
      tabs: Array.from(tabs).map(t => (t as HTMLElement).textContent?.trim()),
      allInputs: Array.from(document.querySelectorAll('input')).map(inp => ({
        type: inp.type,
        accept: inp.accept,
        class: inp.className,
        id: inp.id,
      })),
    };
  });

  console.log("\n=== After 5s more ===");
  console.log(JSON.stringify(retry, null, 2));

  await page.screenshot({ path: "/Users/ayuu/Desktop/zero-code/tmp/xhs-explore.png" });
  await client.disconnect();
}

main().catch(console.error);

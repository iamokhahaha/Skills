/**
 * 渲染 dataviz HTML 模板为 PNG
 * 用法: tsx render-dataviz.ts <dataviz-dir>
 * 例: tsx render-dataviz.ts /path/to/creation/dataviz
 */
import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const datavizDir = process.argv[2];
if (!datavizDir) {
  console.error('用法: tsx render-dataviz.ts <dataviz-dir>');
  process.exit(1);
}

const absDir = path.resolve(datavizDir);

async function main() {
  // 找到所有 HTML 文件
  const htmlFiles = fs.readdirSync(absDir)
    .filter(f => f.endsWith('.html') && f.startsWith('dataviz-'))
    .sort();

  if (htmlFiles.length === 0) {
    console.error('未找到 dataviz-*.html 文件');
    process.exit(1);
  }

  console.log(`找到 ${htmlFiles.length} 个 HTML 模板`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
    deviceScaleFactor: 2, // 2x 清晰度
  });

  for (const htmlFile of htmlFiles) {
    const htmlPath = path.join(absDir, htmlFile);
    const pngFile = htmlFile.replace('.html', '.png');
    const pngPath = path.join(absDir, pngFile);

    const page = await context.newPage();
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
    // 截取 body 实际内容区域（自适应高度，无多余留白）
    const body = page.locator('body');
    await body.screenshot({ path: pngPath, type: 'png' });
    await page.close();

    console.log(`  ${pngFile} ✓`);
  }

  await browser.close();
  console.log('完成');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

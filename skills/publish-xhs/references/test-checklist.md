# 验收测试清单

每次修改脚本后，按以下清单验收（勿跳过）：

## T1. 图文基础发布流程
- [ ] 脚本无报错退出，exit code = 0
- [ ] `tmp/xhs-publish-result.json` 存在且 `"success": true`
- [ ] `tmp/xhs-before-publish.png` 截图可见标题 + 正文 + 图片已上传
- [ ] 创作者平台"已发布"列表出现该帖子

## T2. 正文字数超限 → repurpose 而非截断
- [ ] JSON body > 1000 字时，脚本打印 `⚠️ 正文 X 字超出` 并 `process.exit(1)`（非直接发布）
- [ ] 收到 exit(1) 后，**由外层 skill 触发 AI repurpose**：重写正文到 800-950 字
- [ ] repurpose 后的正文是完整逻辑段落，不是被截断的半句话
- [ ] 重写后更新 JSON，重新运行脚本，正常发布
- [ ] `bodyText` 变量定义在 `page.evaluate()` 调用之前（scope 正确，不出 ReferenceError）

## T3. 定时发布
- [ ] 设置 `scheduledTime: "YYYY-MM-DD HH:mm"` 后，`xhs-schedule-set.png` 截图显示正确时间
- [ ] 发布按钮文本变为"定时发布"（非"发布"）
- [ ] 发布结果包含"已定时"或"定时成功"
- [ ] `.post-time-switch-container .d-switch` toggle 被 Playwright locator 点击（非 evaluate）

## T4. 长图文正文填写速度
- [ ] 5000 字正文 <= 5 秒填写完成（clipboard paste）
- [ ] 正文内容完整出现在编辑器中（抽查段落头尾）
- [ ] 无 `keyboard.type()` 调用（grep 确认）

## T5. 近期 Bug 回归检查
- [ ] `bodyText is not defined`：检查变量在 evaluate() 外定义 → 无 ReferenceError
- [ ] `正文最多支持1000字` toast：正文超限时脚本提前 exit，不会触发该 toast
- [ ] toggle 选择器：使用 `.post-time-switch-container .d-switch` → 点击成功，toggle 变为激活状态

## 验收运行命令

```bash
# 图文发布（T1 + T3）
cd ~/.claude/skills/auto-dev-browser
HEADLESS=true PATH="./node_modules/.bin:$PATH" tsx /Users/ayuu/Desktop/zero-code/tmp/xhs-publish-image.ts

# 检查结果
cat /Users/ayuu/Desktop/zero-code/tmp/xhs-publish-result.json
open /Users/ayuu/Desktop/zero-code/tmp/xhs-before-publish.png
```

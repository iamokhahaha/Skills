# 已验证的选择器（2026-03-09 验证）

## 创作者后台

- 首页：`podcaster.xiaoyuzhoufm.com`
- 节目 dashboard：`/podcasts/{PODCAST_ID}/home`
- 创建单集页：`/podcasts/{PODCAST_ID}/create/episode`
- 内容管理页：`/podcasts/{PODCAST_ID}/contents-management/episodes`
- 新建单集按钮：右上角橙色 "+" 按钮（position click ~1175,80）
- 标题输入：`input[placeholder*="标题"]`
- Show Notes 编辑器：`.ProseMirror` 或 `[contenteditable="true"]`（第一个）
- 音频上传：`input[type="file"][accept="audio/*"]`（hidden, id="upload"）
- 封面上传：点击"点击上传封面"文字触发 `filechooser` 事件，然后裁剪确认（按钮文字"裁剪"）
- 发布选项：`text=立即发布`（默认选中）/ `text=定时发布`
- 协议勾选：`text=阅读并同意` 左侧的 checkbox 区域（注意不要点到链接文字）
- 发布按钮：`text=创建`（蓝色按钮，右下角）
- **无草稿按钮** — 只有"创建"（立即发布）或"定时发布"

## 重要发现

- 首次发布需要**实名认证**（主体认证），弹窗"需完成主体认证后，才能继续操作"
- 封面上传不是 `input[type="file"]`，而是通过点击区域触发 `page.waitForEvent('filechooser')`
- 封面上传后会弹出裁剪对话框，需点击"裁剪"确认
- Show Notes 里的图片插入按钮的 file input（`accept="image/*"`）不是封面上传
- 创建成功后跳转到 `/contents-management/episodes?isFromCreate=true`
- 音频上传后显示"转码中"状态，转码完成后才可收听

## 风控注意

- 操作间 `waitForTimeout(1000-2000)` 随机延迟
- `keyboard.type({ delay: 8-15 })` 模拟真人速度
- 音频上传可能较慢，需耐心等待
- 遇验证码 → 截图通知用户手动处理

## 验收记录

### 2026-03-09 首次验证

- **内容**：抄写员：最后的手艺人 | 当AI取代你的手艺
- **音频**：scribe-podcast.mp3 (8:05, 7.5MB, 8段合并)
- **封面**：scribe-cover-sq.jpg (800x800, 100KB)
- **节目**：玛莎 (ID: 65ed805f8e6f71a5b71b561d)
- **结果**：发布成功，转码中
- **关键修正**：
  - URL 从 `podcasters.xiaoyuzhou.com` 修正为 `podcaster.xiaoyuzhoufm.com`
  - 无草稿功能（之前文档误写有草稿）
  - 封面上传需用 `waitForEvent('filechooser')` 而非 `input[type=file]`
  - 首次需实名认证

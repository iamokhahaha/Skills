# 已验证的选择器（2026-03-11）

## 发布页

- 标签切换：`.creator-tab`（上传视频/上传图文/写长文）
- 上传输入：`input.upload-input`（NOT `input[type="file"]`）
- 标题：`input[placeholder*="标题"]`
- 正文编辑器：`div.tiptap.ProseMirror`
- 标签建议：`#creator-editor-topic-container`
- 草稿按钮：button containing "暂存离开"（NOT "存草稿"）

## 草稿箱

- 打开草稿箱：**必须用** `page.getByText(/草稿箱/)` Playwright locator（`page.evaluate()` 不行）
- 草稿标签：`视频笔记(N)`, `图文笔记(N)`, `长文笔记(N)`
- 编辑按钮：`span:text("编辑")`

## 发布设置页（视频/图文编辑页 或 长文"下一步"后的页面）

页面结构从上到下：
1. **图片编辑** — 封面图区域
2. **帖子标题** — `input[placeholder="填写标题会有更多赞哦"]`（20字限制）
3. **帖子描述** — `.tiptap.ProseMirror`（placeholder: "输入正文描述，真诚有价值的分享予人温暖"）
4. **推荐话题** — `span.tag` 标签可点击添加
5. **话题/用户/表情** — `button.topic-btn`, `button.contentBtn`
6. **活动话题** — 平台推荐话题
7. **内容设置**（默认折叠）— 点击"展开"展开
   - 加入长文合集
   - 原创声明 toggle
   - AI声明 dropdown：显示为"笔记含AI合成内容"等
   - 添加组件：添加地点、选择群聊、关联直播预告等
8. **店内商品** — 添加商品
9. **更多设置**（默认折叠）— 点击"展开"展开
   - 允许合拍 toggle
   - 允许正文复制 toggle
   - **公开可见** dropdown（`.permission-card-select`）
   - **定时发布** toggle 开关（点击 toggle 后出现日期时间选择器）
10. **暂存离开 / 发布** 按钮

### 关键选择器

- **帖子标题**：`input[placeholder*="标题"]`（用 `fill()` 填入）
- **帖子描述**：`.tiptap.ProseMirror`（用 ClipboardEvent paste 填入，不要 keyboard.type）
- **标签**：在描述编辑器里输入 `#标签名`，等待建议出现后 Enter；每个标签名用 paste
- **AI声明**：展开"内容设置"→ `.d-select-wrapper.custom-select-44` filter `hasText: '添加内容类型声明'`
  - 选项：`笔记含AI合成内容` / `虚构演绎，仅供娱乐` / `内容来源声明`
- **可见性**：展开"更多设置"→ `.permission-card-select` 或 `getByText('公开可见')`
  - 选项：`公开可见` / `仅自己可见` / `仅互关好友可见`
- **定时发布**：`.post-time-switch-container .d-switch`（图文上传后设置区已展开，无需额外点"展开"）
  - 开启后出现 `input.d-text[type="text"]`（格式 `YYYY-MM-DD HH:mm`），默认值：当前时间+15分钟
  - 范围：15 分钟 ~ 30 天
  - **Vue 3 input 必须用 nativeInputValueSetter 绕过响应式**，标准 .fill() 无效：
    ```typescript
    await page.evaluate((dateTime: string) => {
      const inputs = Array.from(document.querySelectorAll("input"))
        .filter(el => /\d{4}-\d{2}-\d{2}/.test(el.value) || el.placeholder.includes("日期"));
      if (!inputs.length) return;
      const el = inputs[0];
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (nativeSetter) {
        nativeSetter.call(el, dateTime);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, "2026-03-18 17:00");
    await page.getByRole("button", { name: "确定" }).click();
    ```
  - 开启定时后，底部"发布"按钮文本变为"定时发布"
- **发布按钮**：同时匹配两种文字（定时/立即均可）：
  `page.locator("button").filter({ hasText: /^定时发布$/ }).or(page.locator("button").filter({ hasText: /^发布$/ }))`

### 重要注意

- "内容设置"和"更多设置"默认折叠，必须先点"展开"再操作内部元素
- 描述和标签用 **clipboard paste** 而不是 keyboard.type（速度快、可靠）
- 模板列表需要等待 10-15 秒才能加载完成（初始显示为空白占位符）
- "下一步"点击后，等待 `input[placeholder*="标题"]` 出现确认页面加载

## 长文特有

- 标题：`textarea[placeholder*="标题"]`（64字限制）
- 正文：`div.tiptap.ProseMirror`
- 格式化："一键排版" → 进入模板选择页（等待 10-15s 模板加载）
- 模板选择：`getByText('模板名', { exact: true })` + scrollIntoViewIfNeeded
- 颜色选项：`.color-item`（CSS var `--item-color`）
- 封面设置："模板与封面" button
- 下一步："下一步" button（图片生成中时 disabled，文本"笔记图片生成中，请稍后..."）

## 20 个长文模板

1. 简约基础 2. 清晰明朗 3. 黑白极简 4. 轻感明快 5. 黄昏手稿
6. 手帐书写 7. 灵感备忘 8. 文艺清新 9. 札记集尘 10. 涂鸦马克
11. 素雅底纹 12. 理性现代 13. 优雅几何 14. 逻辑结构 15. 大图纯享
16. 杂志先锋 17. 平实叙事 18. 交叉拓扑 19. 拼接色块 20. 线条复古

杂志先锋颜色：#00E180(绿) #40C7FF(蓝) #DCF07F(黄绿) #CBEBEA(青)

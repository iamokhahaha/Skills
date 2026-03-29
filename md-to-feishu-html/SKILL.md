---
name: md-to-feishu-html
description: Convert Markdown files with pipe tables to Feishu-compatible HTML-table Markdown. Use when the user mentions converting MD to Feishu format, fixing Feishu table rendering, or needs tables with lists/line breaks that display correctly in Feishu documents.
---

# Markdown → 飞书兼容 HTML 表格转换

## 核心问题

飞书通过 pandoc（md → docx）导入文档时，**pipe 表格单元格内的列表和换行无法正确识别**。
原因：pandoc 对 pipe table 单元格只支持行内元素，`<br/>`、`- item`、`&nbsp;` 缩进均被忽略。

## 解决方案

将 pipe 表格转为 HTML `<table>` + `<ul><li>` 格式，pandoc 能正确解析为 docx 中的真实表格和无序列表。

## 使用方式

运行转换脚本（自动处理 pipe 表格 → HTML 表格）：

```bash
python3 ~/.cursor/skills/md-to-feishu-html/scripts/md_to_feishu_html.py INPUT.md
```

参数说明：
- `INPUT.md`：输入 Markdown 文件路径
- `-o OUTPUT.md`：输出文件路径（默认原地覆盖）
- `--stdout`：输出到终端而不写文件

## 转换规则

| 输入格式 | 输出格式 |
|---------|---------|
| `\| header \| header \|` pipe 表格 | `<table><thead>...</thead><tbody>...</tbody></table>` |
| 单元格内 `<br/>` 分隔的 `- item` | `<ul><li>item</li></ul>` |
| `&nbsp;&nbsp;&nbsp;&nbsp;- sub` 缩进子项 | 嵌套 `<ul><li>sub</li></ul>` |
| `**bold**` | `<b>bold</b>` |
| `1. item` / `2. item` 有序列表 | `<ul><li>item</li></ul>`（统一转无序） |
| 非列表文本行 | `<p>text</p>` |
| `> [!TIP]` 等非表格内容 | 原样保留 |
| 已有 HTML 表格 | 不做处理，原样保留 |

## 典型工作流

1. 用户提供/编辑标准 Markdown PRD（pipe 表格 + `<br/>` 换行）
2. 运行转换脚本，生成飞书兼容的 HTML 表格 Markdown
3. 用户自行将生成的 .md 文件导入飞书（飞书云文档 → 导入 → 选择 Markdown）

## 单元格内容书写建议

为确保转换效果最佳，pipe 表格单元格内容建议：
- 用 `<br/>` 分隔每行
- 列表项以 `- ` 开头
- 子级用 `&nbsp;&nbsp;&nbsp;&nbsp;-` 缩进（4 个 `&nbsp;` = 1 级）
- 加粗用 `**text**` 或 `<b>text</b>`

如果单元格内容是纯空格分隔（无 `<br/>`），脚本会尝试按 `数字.` 或 `- ` 模式拆分，但结果可能不理想，建议先手动加 `<br/>`。

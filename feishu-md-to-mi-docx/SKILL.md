---
name: feishu-md-to-mi-docx
description: Upload a local Markdown (.md) file with local images to Xiaomi Feishu (mi.feishu.cn) as a Docx document and grant edit permission to a given email. Use when the user asks to upload Markdown to 飞书/小米飞书/mi.feishu.cn, mentions md带图片/图片不显示, or wants a docx link returned.
---

# Feishu Markdown（含图片）→ 小米飞书 Docx

## 适用场景

- 输入是本地 `*.md`，其中图片是相对路径（如 `![](./static/a.png)`）
- 或者图片是 **Windows 绝对路径**（如 `![](D:\path\to\a.png)`），希望也能正常带图导入
- 需要把内容上传到**小米飞书**（打开会落到 `mi.feishu.cn`）
- 需要给某个邮箱开**编辑**权限
- 输出要求：返回文档链接（优先 `mi.feishu.cn/docx/...`）

## 依赖与前提

- 已在飞书开放平台为应用开通并发布所需权限（至少包含云空间上传与导入相关权限，如 `drive:file:upload`、`docs:document:import`）
- 运行机器已安装 Python 3
- 若要“高保真保留图片+表格”，推荐本地有 `pandoc`（脚本会自动检测）

## 快速使用

在仓库根目录运行：

```bash
python scripts/feishu_md_to_docx.py --md "D:\path\to\xxx.md" --grant-email "someone@xiaomi.com"
```

应用密钥已写在脚本 `scripts/feishu_md_to_docx.py` 顶部的 `APP_ID` / `APP_SECRET` 常量中；如需更换，直接修改那两行即可。

（可选）也支持用环境变量覆盖，优先级高于脚本常量：

```bash
set FEISHU_APP_ID=你的AppID
set FEISHU_APP_SECRET=你的AppSecret
python scripts/feishu_md_to_docx.py --md "D:\path\to\xxx.md" --grant-email "someone@xiaomi.com"
```

## 行为说明（脚本做什么）

1. **优先策略：md → docx（本地转换）→ 上传 → import_tasks 导入为 docx**
   - 解决企业域 `mi.feishu.cn` 下图片“块创建成功但渲染失败”的常见问题
   - 兼容 Windows 绝对路径图片：会在转换前把 `D:\...\a.png` 自动规范化成 `D:/.../a.png`（处理反斜杠；必要时用 `<...>` 包裹以兼容空格），确保图片能被嵌入 docx
2. 若机器未安装 `pandoc`：脚本会提示你安装 `pandoc`；或者你也可以直接提供同名 `*.docx`（与 md 同目录同文件名）让脚本走导入
3. 导入完成后：
   - 打印 `mi.feishu.cn/docx/...` 链接（若接口返回）
   - 授权指定邮箱为 `edit`

## 参数

- `--md`: 必填，Markdown 文件路径
- `--grant-email`: 必填，需要授权的邮箱
- `--host`: 可选，默认 `https://open.feishu.cn`（小米租户一般用这个；脚本会保持全程同域请求）

## 输出

- 终端输出：
  - 导入完成的文档链接（优先 `mi.feishu.cn`）
  - 文档 token


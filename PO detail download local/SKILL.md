---
name: po-local-query
description: Query PO detail data from a local iCRM-exported Excel file (instead of calling iCRM API). Filters by category, order status, project code, area, customer, submit time. Enriches 产品线/产品品类 from 产品线-hxt.xlsx and 经营单元 from 经营单元.xlsx. Outputs Excel (.xlsx). Auto-trigger when user says 查本地PO明细/从本地查PO/本地PO查询/挂单查询.
---

# 本地 PO 明细查询（Excel 文件版）

## 自动触发

当用户输入以下表达时，启用本 skill：
- `查本地PO明细`
- `从本地查PO`
- `本地PO查询`
- `挂单查询`
- `从Excel查PO`

## 能力概述

从本地 iCRM 导出的 Excel 文件中读取 PO 明细数据，按条件筛选后输出 Excel。
**无需 Cookie / HAR / 网络请求**，适合离线或 Cookie 失效场景。

## 数据源

- 默认源文件：`/Users/ok/Downloads/原可用的PO单明细-手机挂单测试1 2026-3-27 14-27-50.xlsx`
- 若用户提供新导出文件，用 `--src` 参数替换
- 源文件为 iCRM「高级查找」导出格式，主数据在 sheet2（`xl/worksheets/sheet2.xml`）

## 源文件列说明

| 源列名 | 映射字段名 |
|--------|----------|
| 商品id | 商品ID |
| PO可用数量 | 可用数量 |
| 提交时间 (PO单) (PO创建) | 提交时间 |
| 审批状态 (PO单) (PO创建) | 审批状态 |
| 客户名称 (PO单) (PO创建) | 客户 |
| 币种 (PO单) (PO创建) | 币种 |
| 米PO号 (PO单) (PO创建) | PO单号 |
| PO状态 (PO单) (PO创建) | 订单状态 |
| 三级渠道 (PO单) (PO创建) | 销售渠道 |
| 订单销售区域 (PO单) (PO创建) | 销售区域 |
| 项目代码 (产品名称) (产品) | 项目代码 |

注意：`提交时间` / `创建时间` 在源文件中为 Excel 序列号，脚本自动转为 `YYYY-MM-DD`。

## 输入条件

| 参数 | 说明 |
|------|------|
| `--category 手机/非手机` | 品类筛选 |
| `--order-status 已审核/部分下单` | 订单状态（已审核=审核通过，部分下单=部分下单） |
| `--project-code <关键词>` | 项目代码模糊匹配 |
| `--area <区域/国家>` | 销售区域，支持区域→国家自动关联（含东亚别名） |
| `--customer <关键词>` | 客户名称模糊匹配 |
| `--submit-time YYYY-MM-DD` | 提交时间起始 |
| `--src <路径>` | 替换源文件路径 |

## 默认输出特性

- 仅保留 `可用数量 > 0` 的记录
- 移除 `品类` 列
- 新增三列：`产品线`、`产品品类`、`经营单元`
- 日期字段自动转为可读格式

## 依赖文件

- 查询脚本：`/Users/ok/Documents/xiaomi skill/.cursor/skills/po-local-query/scripts/po_local_query.py`
- JSON 转 Excel：`/Users/ok/Documents/xiaomi skill/json_to_xlsx.py`
- 产品线映射：`/Users/ok/Downloads/产品线-hxt.xlsx`
- 经营单元映射：`/Users/ok/Downloads/经营单元.xlsx`
- 国家-区域关系表：`/Users/ok/Downloads/国家_地区高级查找视图 2026-3-26 10-12-58.xlsx`

## 执行命令（标准流程）

### 1) 从本地 Excel 筛选，输出 JSON

```bash
python3 "/Users/ok/Documents/xiaomi skill/.cursor/skills/po-local-query/scripts/po_local_query.py" \
  --src "/Users/ok/Downloads/原可用的PO单明细-手机挂单测试1 2026-3-27 14-27-50.xlsx" \
  --category 手机 \
  --area 东南亚 \
  --submit-time 2026-03-15 \
  --out "/Users/ok/Documents/xiaomi skill/po_query_result.json"
```

### 2) JSON 转 Excel

```bash
python3 "/Users/ok/Documents/xiaomi skill/json_to_xlsx.py" \
  --json "/Users/ok/Documents/xiaomi skill/po_query_result.json" \
  --out "/Users/ok/Documents/xiaomi skill/po_query_result.xlsx" \
  --sheet-name "PO查询结果"
```

## 区域匹配规则

与原 icrm-po-detail-query skill 完全一致：
1. `东亚` 自动等同于 `日韩 + 港澳台`
2. 先在国家-区域关系表匹配区域名
3. 未命中区域则直接作为国家关键词匹配 `销售区域` 字段

## 产品线 / 产品品类赋值逻辑

基于 `项目代码` 与 `产品线-hxt.xlsx` 的 `project` 关联：
- 精确匹配 → 前缀匹配 → 包含匹配
- `产品线` = `group`，`产品品类` = `品类`

## 经营单元赋值逻辑

基于 `销售区域` 与 `经营单元.xlsx` 关联：
- 优先按 `订单销售国家` → `Country` → `最终销售地简写` 匹配

## 最终输出

- 最终交付：`/Users/ok/Documents/xiaomi skill/po_query_result.xlsx`
- 中间文件：`/Users/ok/Documents/xiaomi skill/po_query_result.json`

## 与 icrm-po-detail-query 的区别

| 对比项 | icrm-po-detail-query | po-local-query |
|--------|---------------------|----------------|
| 数据来源 | iCRM API（需 Cookie/HAR） | 本地 Excel 文件 |
| 网络依赖 | 是 | 否 |
| 实时性 | 实时 | 取决于导出时间 |
| Cookie 失效 | 需刷新 HAR | 不受影响 |
| 适用场景 | 需要最新数据 | 离线/挂单分析 |

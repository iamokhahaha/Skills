---
name: icrm-po-detail-query
description: Query Xiaomi iCRM PO detail data with optional conditions (category, order status, project code, area, customer, submit time), map readable field names/display values, enrich 产品线/产品品类 from 产品线-hxt.xlsx, auto-map 区域 to 国家 via 国家_地区关系表, and output Excel (.xlsx) as final deliverable. Auto-trigger when user says 查PO明细/查询PO明细/PO明细查询/拉取PO明细.
---

# iCRM PO明细查询（Excel 输出版）

## 自动触发

当用户输入以下表达时，直接启用本 skill：
- `查PO明细`
- `查询PO明细`
- `PO明细查询`
- `拉取PO明细`

## 能力概述

基于 iCRM 页面 HAR 里的 `new_ord_purchaseorderdetails?fetchXml=...` 请求，按条件拉取 PO 明细数据，转换为中文可读字段后，**最终输出 Excel 文件（.xlsx）**。

默认输出特性：
- 字段名使用中文业务名（非 logical name）
- 字段值优先使用显示值（FormattedValue），避免 GUID / 枚举 value
- 仅保留 `可用数量 > 0` 的记录
- 默认移除：`PO明细ID`、`@odata.etag`、`明细名称`
- 移除 `品类` 列
- 新增三列：`产品线`、`产品品类`、`经营单元`

## 输入条件

支持以下入参：
1. 品类：`手机` / `非手机`
2. 订单状态：`已审核` / `部分下单`
3. 项目代码（模糊）
4. 销售区域（模糊，支持“区域→国家自动关联”）
5. 客户（模糊，基于客户主数据）
6. 提交时间（起始）

## 依赖文件

- 查询脚本：`/Users/ok/Documents/xiaomi skill/po_detail_query.py`
- JSON 转 Excel 脚本：`/Users/ok/Documents/xiaomi skill/json_to_xlsx.py`
- HAR：`/Users/ok/Documents/PO明细查询.har`
- 国家主数据：`/Users/ok/Downloads/国家主数据 (1).xlsx`
- 国家-区域关系表：`/Users/ok/Downloads/国家_地区高级查找视图 2026-3-26 10-12-58.xlsx`
- 客户主数据：`/Users/ok/Downloads/客户 (1).xlsx`
- 产品线映射：`/Users/ok/Downloads/产品线-hxt.xlsx`
- 经营单元映射：`/Users/ok/Downloads/经营单元.xlsx`

## 销售区域输入规则（新增）

当用户输入 `--area` 时：
1. 先在国家-区域关系表中匹配“区域”（如：东南亚、拉美、中东）
2. 若输入 `东亚`，按别名规则自动等同于 `日韩 + 港澳台`，并合并这两个区域下所有国家
3. 若命中区域，则自动取该区域下所有国家作为筛选范围
4. 若未命中区域，再回退到国家主数据做国家模糊匹配

## 产品线 / 产品品类赋值逻辑

基于输出记录中的 `项目代码` 与 `产品线-hxt.xlsx` 的 `project` 关联：
- `产品线` = 表中 `group`
- `产品品类` = 表中 `品类`

匹配优先级：
1. 精确匹配（项目代码 == project）
2. 前缀匹配（项目代码以 project 开头）
3. 包含匹配（项目代码包含 project）

## 经营单元赋值逻辑

基于输出记录中的 `销售区域`（国家英文名）与 `经营单元.xlsx` 关联：
- 优先按 `订单销售国家` 匹配
- 其次按 `Country` 匹配
- 最后按 `最终销售地简写` 匹配
- `经营单元` = 表中 `经营单元`

## 执行命令（标准流程）

### 1) 查询并生成可读 JSON（中间产物）

```bash
python3 "/Users/ok/Documents/xiaomi skill/po_detail_query.py" \
  --category 手机 \
  --submit-time 2026-03-15 \
  --area 东亚 \
  --out "/Users/ok/Documents/xiaomi skill/po_query_result.json"
```

### 2) 将 JSON 转换为 Excel（最终产物）

```bash
python3 "/Users/ok/Documents/xiaomi skill/json_to_xlsx.py" \
  --json "/Users/ok/Documents/xiaomi skill/po_query_result.json" \
  --out "/Users/ok/Documents/xiaomi skill/po_query_result.xlsx" \
  --sheet-name "PO查询结果"
```

## 最终输出

- 最终交付文件：`/Users/ok/Documents/xiaomi skill/po_query_result.xlsx`
- `po_query_result.json` 仅作为中间文件，便于排查

## 使用约定

- 查询失败（401/403/超时）时，优先提示 Cookie 可能失效，建议刷新 HAR 后重试。
- 查询返回过大时可缩小时间范围或增加条件以提高稳定性。
- 国家/客户/区域模糊匹配时，优先展示 Top5 供确认。

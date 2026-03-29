---
name: so-lock
description: Query Xiaomi iCRM sales orders and return SO numbers whose status is 合规扫描已锁定. Use when user says 查SO锁定的订单, SO锁定订单查询, or asks for 合规扫描已锁定 的SO号.
---

# SO Lock

## 自动触发

当用户输入以下表达时，启用本 skill：
- `查SO锁定的订单`
- `SO锁定订单查询`
- `查合规扫描已锁定SO`
- `返回合规扫描已锁定的SO号`

## 目标

查询 iCRM 销售订单（`new_ord_saleorder`），筛选状态为 `合规扫描已锁定` 的记录，并返回 `SO号`（字段 `new_name`）。

## 输入

- 用户自然语言触发词即可（默认查最近数据）
- 可选：用户提供 Cookie（`MSISAuth` + `MSISAuth1` 等）
- 可选：用户提供 HAR（若网络不可达时离线提取）

## 执行优先级

1. **在线查询（优先）**：直接调用 iCRM API
2. **离线查询（兜底）**：从 HAR 里提取 SO 列表响应并筛选

## 在线查询（标准）

### 1) 组装 FetchXML

实体：`new_ord_saleorder`

最小字段：
- `new_name`（SO号）
- `new_satatus`（状态）
- `createdon`
- `new_ord_saleorderid`

基础过滤：
- `statecode = 0`

排序：
- `createdon desc`

### 2) 调用 API

```bash
curl -sS "https://icrm.be.mi.com/api/data/v9.0/new_ord_saleorders?fetchXml=<URL_ENCODED_FETCHXML>" \
  -H 'Accept: application/json' \
  -H 'OData-MaxVersion: 4.0' \
  -H 'OData-Version: 4.0' \
  -H 'Prefer: odata.include-annotations="*"' \
  -H 'User-Agent: Mozilla/5.0' \
  -H "Cookie: <Cookie>"
```

### 3) 筛选逻辑

只保留：
- `new_satatus@OData.Community.Display.V1.FormattedValue == "合规扫描已锁定"`

输出：
- `new_name` 列表（去重）

## 离线 HAR 查询（兜底）

当在线查询失败（如 403/无法解析域名）时：

1. 在 HAR 中定位：
   - 请求 URL 包含 `/api/data/v9.0/new_ord_saleorders?fetchXml=`
2. 读取该条目的 `response.content.text`
3. 解析 JSON 后按同样状态规则筛选
4. 返回 SO号列表

## 返回格式

- 默认仅返回 SO号清单（每行一个）
- 若无结果，明确返回：`未查询到状态为“合规扫描已锁定”的SO订单`
- 若接口失败，明确返回状态码和原因（如 Cookie 过期 / 网络不可达）

## 异常处理

- `401`：提示 Cookie 过期，请用户提供最新 Cookie 或 HAR
- `403`：提示权限/网络限制，建议改用 HAR 离线提取
- 网络错误（DNS/隧道失败）：提示当前环境不可达，改用 HAR

## 口径约定

- “SO号”统一指 `new_name`
- “锁定订单”统一指状态显示值 `合规扫描已锁定`

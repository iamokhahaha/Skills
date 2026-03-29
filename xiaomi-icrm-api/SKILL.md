---
name: xiaomi-icrm-api
description: 操作小米内部 CRM 系统 (icrm.be.mi.com) 的 API，基于 Microsoft Dynamics 365 On-Premise。支持查询、更新采购订单字段，调用自定义 Action 等。使用场景：用户要对 iCRM 采购订单做增删改查、调用 PoOrder 相关接口、分析 HAR 文件中的 CRM 请求时。执行前需要用户提供有效 Cookie，如 Cookie 过期需主动向用户索要。
---

# 小米 iCRM API 操作

## 基本信息

| 项目 | 值 |
|---|---|
| 域名 | `https://icrm.be.mi.com` |
| 平台 | Microsoft Dynamics 365 On-Premise v9.1 |
| 认证方式 | ADFS Cookie（`MSISAuth` + `MSISAuth1`） |
| 主要实体 | `new_ord_purchaseorder`（采购订单） |

## 执行原则

1. 用户要求执行 API 时，**直接用 curl 执行**，不要让用户自己跑
2. 如果没有 Cookie 或 Cookie 已过期（返回 `401`），**主动向用户要新的 Cookie**
3. 执行完成后告知用户结果（状态码 + 含义）

## 通过客户 PO 单号更新备注（核心工作流）

用户输入**客户 PO 单号**（如 `PCC26-01-04CIP`）和备注内容时，执行以下两步：

### 第一步：用 PO 单号查询订单 GUID

```bash
COOKIE="<Cookie>"
PO_NO="<PO单号>"

GUID=$(curl -s -X GET \
  "https://icrm.be.mi.com/api/data/v8.2/new_ord_purchaseorders?\$select=new_ord_purchaseorderid&\$filter=new_customer_pono eq '${PO_NO}'" \
  -H 'OData-MaxVersion: 4.0' \
  -H 'OData-Version: 4.0' \
  -H 'Accept: application/json' \
  -H "Cookie: ${COOKIE}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['value'][0]['new_ord_purchaseorderid'] if d['value'] else '')")

echo "GUID: $GUID"
```

若 GUID 为空，说明该 PO 单号不存在，告知用户。

字段说明：
- `new_customer_pono` — 客户 PO 单号（如 `PCC26-01-04CIP`）
- `new_name` — 系统内部 PO 编号（如 `POEU202601200093`）
- 两者都可作为查询条件，根据用户输入的格式判断用哪个

### 第二步：用 GUID 更新备注

```bash
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
  "https://icrm.be.mi.com/api/data/v9.0/new_ord_purchaseorders(${GUID})" \
  -H 'Content-Type: application/json' \
  -H 'If-Match: *' \
  -H 'mscrm.suppressduplicatedetection: true' \
  -H "Cookie: ${COOKIE}" \
  -d "{\"new_accountremarks\":\"<备注内容>\"}")

echo "Status: $STATUS"
```

返回 `204` 即成功，告知用户"PO 单 `<PO单号>` 的备注已更新为 `<备注内容>`"。

## 认证

所有请求必须携带 Cookie：

```
MSISAuth=<值>; MSISAuth1=<值>; ReqClientId=<值>; orgId=<值>; lastUsedApp=<值>
```

Cookie 从用户浏览器中获取，有效期较短，过期后需重新登录获取。

## 常用请求模板

### 更新采购订单字段（PATCH）

```bash
curl -s -o /dev/null -w "%{http_code}" -X PATCH \
  'https://icrm.be.mi.com/api/data/v9.0/new_ord_purchaseorders(<订单ID>)' \
  -H 'Content-Type: application/json' \
  -H 'If-Match: *' \
  -H 'mscrm.suppressduplicatedetection: true' \
  -H 'autodisassociate: true' \
  -H 'Prefer: odata.include-annotations="*"' \
  -H 'Cookie: <Cookie>' \
  -d '{"<字段名>":"<新值>"}'
```

- 成功返回 `204`
- 常用字段：`new_accountremarks`（开票备注）

### 查询采购订单（GET）

```bash
curl -s -X GET \
  'https://icrm.be.mi.com/api/data/v8.2/new_ord_purchaseorders?$select=<字段>&$filter=new_ord_purchaseorderid eq (<订单ID>)' \
  -H 'Content-Type: application/json; charset=utf-8' \
  -H 'OData-MaxVersion: 4.0' \
  -H 'OData-Version: 4.0' \
  -H 'Prefer: odata.include-annotations="OData.Community.Display.V1.FormattedValue"' \
  -H 'Cookie: <Cookie>'
```

### 调用自定义 Action（POST to new_poordermanage）

```bash
curl -s -X POST \
  'https://icrm.be.mi.com/api/data/v8.2/new_poordermanage' \
  -H 'Content-Type: application/json; charset=UTF-8' \
  -H 'OData-MaxVersion: 4.0' \
  -H 'OData-Version: 4.0' \
  -H 'Cookie: <Cookie>' \
  -d '{"Api":"<接口名>","Input":"{\"poid\":\"<订单ID>\"}","LangId":2052}'
```

常用接口名：
- `PoOrder/PoSpecialApplyShow` — 检查是否展示特殊申请
- `PoOrder/PoEtaConfigurationCheck` — 检查 ETA 配置

### 批量查询（POST $batch）

```bash
curl -s -X POST \
  'https://icrm.be.mi.com/api/data/v9.0/$batch' \
  -H 'Content-Type: multipart/mixed;boundary=batch_<时间戳>' \
  -H 'OData-MaxVersion: 4.0' \
  -H 'OData-Version: 4.0' \
  -H 'Prefer: odata.include-annotations="*"' \
  -H 'Cookie: <Cookie>' \
  -d '--batch_<时间戳>
Content-Type: application/http
Content-Transfer-Encoding: binary

GET /api/data/v9.0/new_ord_purchaseorders(<订单ID>)?$select=<字段列表> HTTP/1.1

--batch_<时间戳>--'
```

## 响应状态码说明

| 状态码 | 含义 |
|---|---|
| `204` | 成功（PATCH/DELETE 无响应体） |
| `200` | 成功（GET/POST 有响应体） |
| `401` | Cookie 过期，需向用户要新 Cookie |
| `403` | 无权限 |
| `412` | ETag 冲突，记录已被他人修改 |
| `500` | 服务端错误，可能触发了后端插件校验 |

## 订单状态码（new_status）

| 值 | 含义 |
|---|---|
| `9` | 关闭客户确认中 |

## 注意事项

- `new_ord_purchaseorderid` 在 URL 中小写，在 `$filter` 中大写，均可识别
- 自定义 Action 用 v8.2，标准实体操作用 v9.0
- `LangId: 2052` 为简体中文

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
po_local_query.py  -  从本地 Excel PO 明细按条件筛选，输出 JSON
用法：
  python3 po_local_query.py --src "...xlsx" --category 手机 --area 东南亚 \
    --submit-time 2026-03-01 --out po_query_result.json
"""
import argparse, json, re, zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from pathlib import Path

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"

COL_MAP = {
    "(不要修改) PO单明细":         None,
    "(不要修改) 行校验和":          None,
    "(不要修改) 修改时间":          None,
    "商品id":                       "商品ID",
    "PO可用数量":                    "可用数量",
    "提交时间 (PO单) (PO创建)":     "提交时间",
    "审批状态 (PO单) (PO创建)":     "审批状态",
    "客户名称 (PO单) (PO创建)":     "客户",
    "币种 (PO单) (PO创建)":         "币种",
    "状态 (PO单) (PO创建)":         "PO明细状态",
    "创建时间 (PO单) (PO创建)":     "创建时间",
    "米PO号 (PO单) (PO创建)":       "PO单号",
    "PO状态 (PO单) (PO创建)":       "订单状态",
    "三级渠道 (PO单) (PO创建)":     "销售渠道",
    "产品品类 (PO单) (PO创建)":     "品类",
    "订单销售区域 (PO单) (PO创建)": "销售区域",
    "状态":                          "明细状态",
    "项目代码 (产品名称) (产品)":    "项目代码",
}
EXCLUDE_OUTPUT = {"品类"}
AREA_ALIASES = {"东亚": ["日韩", "港澳台"]}

def _cell_value(c):
    is_el = c.find(f"{{{NS}}}is")
    if is_el is not None:
        return "".join(t.text or "" for t in is_el.iter(f"{{{NS}}}t"))
    v = c.find(f"{{{NS}}}v")
    return (v.text or "") if v is not None else ""

def _col_idx(ref):
    letters = re.match(r"[A-Z]+", ref).group()
    idx = 0
    for ch in letters:
        idx = idx * 26 + (ord(ch) - ord("A") + 1)
    return idx - 1

def _parse_sheet(xml_path):
    headers, rows = [], []
    for _ev, elem in ET.iterparse(str(xml_path), events=("end",)):
        if elem.tag != f"{{{NS}}}row":
            elem.clear(); continue
        cells = elem.findall(f"{{{NS}}}c")
        if not headers:
            headers = [_cell_value(c) for c in cells]
            elem.clear(); continue
        rv = [""] * len(headers)
        for c in cells:
            ref = c.attrib.get("r", "")
            if ref:
                i = _col_idx(ref)
                if i < len(headers):
                    rv[i] = _cell_value(c)
        elem.clear()
        rows.append({h: (rv[i] if i < len(rv) else "") for i, h in enumerate(headers)})
    return rows

def _extract(xlsx, sheet_xml, tmp):
    with zipfile.ZipFile(xlsx) as z:
        with z.open(sheet_xml) as f:
            Path(tmp).write_bytes(f.read())

def read_source_excel(path):
    tmp = "/tmp/_po_src.xml"
    _extract(path, "xl/worksheets/sheet2.xml", tmp)
    raw = _parse_sheet(tmp)
    Path(tmp).unlink(missing_ok=True)
    result = []
    for r in raw:
        item = {}
        for src, dst in COL_MAP.items():
            if dst is not None:
                item[dst] = r.get(src, "")
        for k, v in r.items():
            if k not in COL_MAP:
                item[k] = v
        result.append(item)
    return result

def _read_helper(xlsx, sheet_xml):
    tmp = "/tmp/_po_helper.xml"
    _extract(xlsx, sheet_xml, tmp)
    rows = _parse_sheet(tmp)
    Path(tmp).unlink(missing_ok=True)
    return rows

def load_project_mapping(path):
    rows = _read_helper(path, "xl/worksheets/sheet1.xml")
    m = {}
    for r in rows:
        proj = (r.get("project","") or "").strip().upper()
        if proj:
            m[proj] = {"产品线": (r.get("group","") or "").strip(),
                       "产品品类": (r.get("品类","") or "").strip()}
    return m

def load_business_unit_mapping(path):
    rows = _read_helper(path, "xl/worksheets/sheet1.xml")
    m = {}
    for r in rows:
        unit = (r.get("经营单元","") or "").strip()
        if not unit: continue
        for key in ["订单销售国家","Country","最终销售地简写"]:
            k = (r.get(key,"") or "").strip()
            if k: m[k] = unit
    return m

def load_region_country_mapping(path):
    rows = _read_helper(path, "xl/worksheets/sheet2.xml")
    rm = {}
    for r in rows:
        country = (r.get("国家/地区","") or "").strip()
        region  = (r.get("区域","") or "").strip()
        if country and region:
            rm.setdefault(region, set()).add(country)
    return {k: sorted(v) for k, v in rm.items()}

def fuzzy_match(text, candidates):
    if not text or not candidates: return None, []
    q = text.strip().lower()
    scored = [(1.0 if q in c.lower() else SequenceMatcher(None,q,c.lower()).ratio(), c) for c in candidates]
    scored.sort(reverse=True, key=lambda x: x[0])
    return scored[0][1], scored[:5]

def resolve_area(area_input, region_map):
    if not area_input: return [], None
    aliases = AREA_ALIASES.get(area_input.strip(), [])
    if aliases:
        merged = set()
        for alias in aliases:
            for rname, countries in region_map.items():
                if alias.lower() in rname.lower():
                    merged.update(countries)
        if merged:
            print(f"区域别名 {area_input}=>{'+'.join(aliases)}，共{len(merged)}个国家")
            return sorted(merged), area_input
    for rname in region_map:
        if area_input.lower() in rname.lower() or rname.lower() in area_input.lower():
            print(f"匹配区域: {rname}，共{len(region_map[rname])}个国家")
            return region_map[rname], rname
    best, top5 = fuzzy_match(area_input, list(region_map.keys()))
    if best and top5 and top5[0][0] >= 0.55:
        print(f"模糊匹配区域: {best} ({top5[0][0]:.2f})")
        return region_map[best], best
    print(f"未匹配到区域，将'{area_input}'作为国家关键词")
    return [], area_input

def resolve_project_info(code, mapping):
    code = (code or "").strip().upper()
    if not code: return "", ""
    if code in mapping: m=mapping[code]; return m["产品线"],m["产品品类"]
    pk = sorted([k for k in mapping if code.startswith(k)], key=len, reverse=True)
    if pk: m=mapping[pk[0]]; return m["产品线"],m["产品品类"]
    ck = sorted([k for k in mapping if k in code], key=len, reverse=True)
    if ck: m=mapping[ck[0]]; return m["产品线"],m["产品品类"]
    return "", ""

def to_date_str(raw):
    s = str(raw or "").strip()
    if not s: return s
    if re.match(r"^\d+(\.\d+)?$", s):
        try:
            return (datetime(1899,12,30)+timedelta(days=float(s))).strftime("%Y-%m-%d")
        except: return s
    return s[:10]

def filter_rows(rows, args, area_countries, area_kw):
    out = []
    for r in rows:
        try: qty = float(str(r.get("可用数量",0) or 0).replace(",",""))
        except: qty = 0.0
        if qty <= 0: continue
        if args.category:
            cat = str(r.get("品类","") or "").strip()
            if args.category=="手机" and cat!="手机": continue
            if args.category=="非手机" and cat=="手机": continue
        if args.order_status:
            status = str(r.get("订单状态","") or "").strip()
            expected = {"已审核":"审核通过","部分下单":"部分下单"}.get(args.order_status,args.order_status)
            if expected.lower() not in status.lower(): continue
        if args.project_code:
            code = str(r.get("项目代码","") or "").strip().lower()
            if args.project_code.strip().lower() not in code: continue
        if args.area:
            av = str(r.get("销售区域","") or "").strip()
            if area_countries:
                if not any(c.lower() in av.lower() for c in area_countries): continue
            elif area_kw:
                if area_kw.lower() not in av.lower(): continue
        if args.customer:
            cv = str(r.get("客户","") or "").strip().lower()
            if args.customer.strip().lower() not in cv: continue
        if args.submit_time:
            rt = str(r.get("提交时间","") or "").strip()
            try:
                if to_date_str(rt) < args.submit_time: continue
            except: pass
        out.append(r)
    return out

def enrich_rows(rows, proj_map, bu_map):
    result = []
    for r in rows:
        row = dict(r)
        for col in EXCLUDE_OUTPUT: row.pop(col, None)
        code = str(row.get("项目代码","") or "").strip()
        row["产品线"], row["产品品类"] = resolve_project_info(code, proj_map)
        area = str(row.get("销售区域","") or "").strip()
        row["经营单元"] = bu_map.get(area, "")
        for dc in ["提交时间","创建时间"]:
            v = str(row.get(dc,"") or "").strip()
            if v and re.match(r"^\d+(\.\d+)?$", v):
                row[dc] = to_date_str(v)
        result.append(row)
    return result

def main():
    p = argparse.ArgumentParser(description="从本地 Excel PO 明细筛选输出 JSON")
    p.add_argument("--src", default="/Users/ok/Downloads/原可用的PO单明细-手机挂单测试1 2026-3-27 14-27-50.xlsx")
    p.add_argument("--product-line-xlsx", default="/Users/ok/Downloads/产品线-hxt.xlsx")
    p.add_argument("--business-unit-xlsx", default="/Users/ok/Downloads/经营单元.xlsx")
    p.add_argument("--region-country-xlsx", default="/Users/ok/Downloads/国家_地区高级查找视图 2026-3-26 10-12-58.xlsx")
    p.add_argument("--category", choices=["手机","非手机"])
    p.add_argument("--order-status", choices=["已审核","部分下单"])
    p.add_argument("--project-code")
    p.add_argument("--area")
    p.add_argument("--customer")
    p.add_argument("--submit-time")
    p.add_argument("--out", default="/Users/ok/Documents/xiaomi skill/po_query_result.json")
    args = p.parse_args()

    print("读取源文件:", args.src)
    rows = read_source_excel(args.src)
    print(f"共 {len(rows)} 条记录")

    proj_map = load_project_mapping(args.product_line_xlsx)
    bu_map   = load_business_unit_mapping(args.business_unit_xlsx)
    reg_map  = load_region_country_mapping(args.region_country_xlsx)

    area_countries, area_kw = [], None
    if args.area:
        area_countries, area_kw = resolve_area(args.area, reg_map)

    filtered = filter_rows(rows, args, area_countries, area_kw)
    print(f"筛选后: {len(filtered)} 条")

    enriched = enrich_rows(filtered, proj_map, bu_map)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(enriched, f, ensure_ascii=False, indent=2)
    print("输出:", args.out)

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
将 Markdown pipe 表格转换为飞书兼容的 HTML 表格格式。

pipe 表格单元格内的 <br/> 分隔列表和 &nbsp; 缩进在 pandoc → docx 流程中
会丢失格式。本脚本将其转换为 HTML <table> + <ul><li>，pandoc 可正确输出
到 docx，飞书导入后列表和换行均能正常显示。
"""

import argparse
import re
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# inline markdown → html
# ---------------------------------------------------------------------------

def md_inline_to_html(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"「(.+?)」", r"「\1」", text)
    text = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", r'<img src="\2" alt="\1"/>', text)
    return text


# ---------------------------------------------------------------------------
# cell content → html blocks
# ---------------------------------------------------------------------------

def _count_nbsp_indent(line: str):
    """返回 (indent_level, 去掉前缀后的文本)"""
    count = 0
    s = line
    while s.startswith("&nbsp;"):
        count += 1
        s = s[6:]
    s = s.strip()
    level = (count + 3) // 4  # 每 4 个 &nbsp; 算一级，不足 4 个也算一级
    return level, s


def _split_cell_lines(raw: str) -> list[str]:
    """按 <br/> 或 <br> 拆分单元格内容为多行。"""
    return [l.strip() for l in re.split(r"<br\s*/?>", raw)]


_RE_UL = re.compile(r"^[-*]\s+(.*)")
_RE_OL = re.compile(r"^\d+[.)]\s+(.*)")


def _parse_line(line: str):
    """
    返回 (indent_level, line_type, content)
    line_type: 'ul' | 'text' | 'blank'
    """
    if not line:
        return (0, "blank", "")

    level, stripped = _count_nbsp_indent(line)

    m = _RE_UL.match(stripped)
    if m:
        return (level, "ul", md_inline_to_html(m.group(1)))

    m = _RE_OL.match(stripped)
    if m:
        return (level, "ul", md_inline_to_html(m.group(1)))

    return (level, "text", md_inline_to_html(stripped))


def _build_ul(items: list, idx: int, base_level: int) -> tuple[str, int]:
    """
    从 items[idx] 开始，构建 <ul>...</ul>，返回 (html, next_index)。
    items 元素: (level, 'ul', content)
    """
    parts: list[str] = []
    i = idx

    while i < len(items):
        level, typ, content = items[i]

        if typ != "ul" or level < base_level:
            break

        if level > base_level:
            sub_html, i = _build_ul(items, i, level)
            if parts:
                last = parts.pop()
                if last.endswith("</li>"):
                    last = last[: -len("</li>")]
                parts.append(f"{last}\n{sub_html}\n</li>")
            else:
                parts.append(sub_html)
            continue

        parts.append(f"<li>{content}</li>")
        i += 1

    inner = "\n".join(parts)
    return f"<ul>\n{inner}\n</ul>", i


def cell_to_html(raw: str) -> str:
    """将单元格原始文本转为 HTML 块元素。"""
    raw = raw.strip()
    if not raw:
        return ""

    lines = _split_cell_lines(raw)
    parsed = [_parse_line(l) for l in lines]

    result: list[str] = []
    i = 0

    while i < len(parsed):
        level, typ, content = parsed[i]

        if typ == "blank":
            i += 1
            continue

        if typ == "ul":
            html, i = _build_ul(parsed, i, level)
            result.append(html)
        else:
            result.append(f"<p>{content}</p>")
            i += 1

    return "\n".join(result)


# ---------------------------------------------------------------------------
# pipe table detection & conversion
# ---------------------------------------------------------------------------

def _is_separator(line: str) -> bool:
    s = line.strip()
    if not s.startswith("|"):
        return False
    cells = [c.strip() for c in s.strip("|").split("|")]
    return all(re.match(r"^[-:]+$", c) for c in cells if c)


def _split_row(line: str) -> list[str]:
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    return [c.strip() for c in s.split("|")]


def _pipe_table_to_html(table_lines: list[str]) -> str:
    headers = _split_row(table_lines[0])
    body_lines = table_lines[2:]

    parts = ["<table>", "<thead>", "<tr>"]
    for h in headers:
        parts.append(f"<th>{md_inline_to_html(h)}</th>")
    parts.append("</tr>")
    parts.append("</thead>")
    parts.append("<tbody>")
    parts.append("")

    for row_line in body_lines:
        if not row_line.strip():
            continue
        cells = _split_row(row_line)
        parts.append("<tr>")
        for cell_raw in cells:
            html = cell_to_html(cell_raw)
            if "\n" in html:
                parts.append("<td>")
                parts.append(html)
                parts.append("</td>")
            else:
                parts.append(f"<td>{html}</td>")
        parts.append("</tr>")
        parts.append("")

    parts.append("</tbody>")
    parts.append("</table>")
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# full document conversion
# ---------------------------------------------------------------------------

def convert(md_text: str) -> str:
    lines = md_text.split("\n")
    result: list[str] = []
    i = 0

    while i < len(lines):
        line = lines[i]

        if (
            line.strip().startswith("|")
            and "|" in line.strip()[1:]
            and i + 1 < len(lines)
            and _is_separator(lines[i + 1])
        ):
            table_lines = [line]
            j = i + 1
            while j < len(lines) and lines[j].strip().startswith("|"):
                table_lines.append(lines[j])
                j += 1
            result.append(_pipe_table_to_html(table_lines))
            i = j
            continue

        result.append(line)
        i += 1

    return "\n".join(result)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(
        description="Convert Markdown pipe tables to Feishu-compatible HTML tables"
    )
    ap.add_argument("input", help="Input Markdown file")
    ap.add_argument("-o", "--output", help="Output path (default: overwrite input)")
    ap.add_argument("--stdout", action="store_true", help="Print to stdout")
    args = ap.parse_args()

    src = Path(args.input)
    if not src.exists():
        print(f"Error: {src} not found", file=sys.stderr)
        sys.exit(1)

    content = src.read_text(encoding="utf-8")
    converted = convert(content)

    if args.stdout:
        print(converted)
    else:
        dst = Path(args.output) if args.output else src
        dst.write_text(converted, encoding="utf-8")
        print(f"Done: {dst}")


if __name__ == "__main__":
    main()

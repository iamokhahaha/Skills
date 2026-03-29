#!/usr/bin/env python3
"""Create PDF documents from text, HTML, or Markdown with CJK support.

Priority chain for HTML/Markdown → PDF:
  1. Chrome headless (best CJK rendering, requires Chrome/Chromium)
  2. reportlab with system CJK font (fallback for plain text)
"""

import argparse
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import urllib.parse


# ==================== Chrome Headless ====================

def _find_chrome() -> str | None:
    """Find Chrome/Chromium binary path."""
    candidates = []
    if platform.system() == "Darwin":
        candidates = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        ]
    elif platform.system() == "Linux":
        candidates = ["google-chrome", "chromium-browser", "chromium"]

    for c in candidates:
        if os.path.isabs(c) and os.path.exists(c):
            return c
        elif shutil.which(c):
            return shutil.which(c)
    return None


def _chrome_html_to_pdf(html_path: str, output_path: str) -> bool:
    """Use Chrome headless to convert an HTML file to PDF. Returns True on success."""
    chrome = _find_chrome()
    if not chrome:
        return False

    try:
        file_url = "file://" + urllib.parse.quote(os.path.abspath(html_path))
        result = subprocess.run(
            [chrome, "--headless", "--disable-gpu", f"--print-to-pdf={output_path}", "--no-margins", file_url],
            capture_output=True, text=True, timeout=30,
        )
        return result.returncode == 0 and os.path.exists(output_path)
    except Exception:
        return False


# ==================== Reportlab (plain text fallback) ====================

def _register_cjk_font():
    """Register a CJK font for Chinese/Japanese/Korean text support."""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    candidates = [
        "/Library/Fonts/Arial Unicode.ttf",
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
    ]
    if platform.system() == "Linux":
        candidates = [
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
        ] + candidates

    for font_path in candidates:
        if os.path.exists(font_path):
            try:
                if font_path.endswith(".ttc"):
                    pdfmetrics.registerFont(TTFont("CJK", font_path, subfontIndex=0))
                else:
                    pdfmetrics.registerFont(TTFont("CJK", font_path))
                return "CJK"
            except Exception:
                continue
    return None


# ==================== Public API ====================

def create_pdf_from_text(output_path: str, text: str):
    """Create a PDF from plain text."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.units import inch
    except ImportError:
        print("Error: reportlab not installed. Run: pip install reportlab", file=sys.stderr)
        sys.exit(1)

    try:
        cjk_font = _register_cjk_font()
        font_name = cjk_font or "Helvetica"

        doc = SimpleDocTemplate(output_path, pagesize=A4,
                                rightMargin=72, leftMargin=72,
                                topMargin=72, bottomMargin=72)

        styles = getSampleStyleSheet()
        style = ParagraphStyle(
            'CustomStyle', parent=styles['Normal'],
            fontName=font_name, fontSize=11, leading=16, spaceAfter=12,
        )

        story = []
        for para in text.split('\n\n'):
            if para.strip():
                safe = para.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                safe = safe.replace('\n', '<br/>')
                story.append(Paragraph(safe, style))
                story.append(Spacer(1, 0.2 * inch))

        doc.build(story)
        print(f"PDF created successfully: {output_path}")

    except Exception as e:
        print(f"Error creating PDF: {e}", file=sys.stderr)
        sys.exit(1)


def create_pdf_from_html(output_path: str, html: str):
    """Create a PDF from HTML string. Uses Chrome headless (best quality)."""
    with tempfile.NamedTemporaryFile(suffix=".html", mode="w", encoding="utf-8", delete=False) as f:
        f.write(html)
        tmp_html = f.name

    try:
        if _chrome_html_to_pdf(tmp_html, output_path):
            print(f"PDF created successfully: {output_path}")
            return

        # Chrome not available — warn and try reportlab
        print("Warning: Chrome not found, falling back to reportlab (CJK may not render correctly)", file=sys.stderr)
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.platypus import SimpleDocTemplate, Paragraph
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        except ImportError:
            print("Error: Install Google Chrome or reportlab", file=sys.stderr)
            sys.exit(1)

        cjk_font = _register_cjk_font()
        font_name = cjk_font or "Helvetica"
        doc = SimpleDocTemplate(output_path, pagesize=A4, rightMargin=72, leftMargin=72, topMargin=72, bottomMargin=72)
        styles = getSampleStyleSheet()
        style = ParagraphStyle('CJK', parent=styles['Normal'], fontName=font_name, fontSize=11, leading=16)
        doc.build([Paragraph(html, style)])
        print(f"PDF created successfully: {output_path}")

    finally:
        os.unlink(tmp_html)


def create_pdf_from_markdown(output_path: str, markdown_text: str):
    """Create a PDF from Markdown content with full CJK support."""
    try:
        import markdown
    except ImportError:
        print("Error: markdown not installed. Run: pip install markdown", file=sys.stderr)
        sys.exit(1)

    html_body = markdown.markdown(markdown_text, extensions=["tables", "fenced_code"])

    full_html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
         "Noto Sans CJK SC", "Microsoft YaHei", "WenQuanYi Micro Hei", sans-serif;
         font-size: 14px; line-height: 1.7; color: #333; max-width: 800px; margin: 0 auto; padding: 40px; }}
  h1 {{ font-size: 24px; border-bottom: 2px solid #333; padding-bottom: 8px; }}
  h2 {{ font-size: 20px; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-top: 32px; }}
  h3 {{ font-size: 16px; margin-top: 24px; }}
  table {{ border-collapse: collapse; width: 100%; margin: 14px 0; }}
  th, td {{ border: 1px solid #ddd; padding: 8px 12px; text-align: left; font-size: 13px; }}
  th {{ background: #f5f5f5; font-weight: 600; }}
  code {{ background: #f4f4f4; padding: 2px 5px; border-radius: 3px;
         font-family: Menlo, Monaco, "Courier New", monospace; font-size: 12px; word-break: break-all; }}
  pre {{ background: #f8f8f8; padding: 14px; border-radius: 6px; overflow-x: auto; font-size: 12px; }}
  pre code {{ background: none; padding: 0; }}
  blockquote {{ border-left: 3px solid #ddd; margin: 14px 0; padding: 10px 18px; color: #666; }}
  hr {{ border: none; border-top: 1px solid #ddd; margin: 24px 0; }}
  @media print {{ body {{ margin: 0; padding: 20px; }} }}
</style>
</head><body>{html_body}</body></html>"""

    create_pdf_from_html(output_path, full_html)


def main():
    parser = argparse.ArgumentParser(description="Create PDF documents with CJK support")
    parser.add_argument("output_path", help="Output PDF file path")

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--text", help="Plain text content")
    group.add_argument("--html", help="HTML content")
    group.add_argument("--markdown", help="Markdown content")
    group.add_argument("--text-file", help="Path to text file")
    group.add_argument("--html-file", help="Path to HTML file")
    group.add_argument("--markdown-file", help="Path to Markdown file")

    args = parser.parse_args()

    if args.text:
        create_pdf_from_text(args.output_path, args.text)
    elif args.html:
        create_pdf_from_html(args.output_path, args.html)
    elif args.markdown:
        create_pdf_from_markdown(args.output_path, args.markdown)
    elif args.text_file:
        with open(args.text_file, 'r', encoding='utf-8') as f:
            create_pdf_from_text(args.output_path, f.read())
    elif args.html_file:
        with open(args.html_file, 'r', encoding='utf-8') as f:
            create_pdf_from_html(args.output_path, f.read())
    elif args.markdown_file:
        with open(args.markdown_file, 'r', encoding='utf-8') as f:
            create_pdf_from_markdown(args.output_path, f.read())


if __name__ == "__main__":
    main()

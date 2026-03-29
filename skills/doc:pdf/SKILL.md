---
name: doc:pdf
description: "Comprehensive PDF document processing, extraction, and creation. When Claude needs to work with PDF files (.pdf) for: (1) Reading and extracting text from PDFs, (2) Extracting tables from PDFs, (3) Creating new PDF documents, (4) Getting PDF metadata and page count, or any other PDF-related tasks"
---

# PDF Skill

A comprehensive skill for working with PDF documents.

## Capabilities

- **Read PDFs**: Extract text content from PDF files
- **Extract Tables**: Get tabular data from PDF pages
- **Create PDFs**: Generate new PDF documents from text or HTML
- **PDF Metadata**: Get page count, author, title, and other metadata

## Usage

When the user asks to work with PDF files, use the appropriate Python script.

### Reading PDF Text

```bash
python3 ~/.claude/skills/doc:pdf/read_pdf.py "<pdf_path>" [--page <page_number>]
```

Options:
- `--page`: Extract text from specific page (0-indexed)
- Without `--page`: Extract all text

### Extracting Tables

```bash
python3 ~/.claude/skills/doc:pdf/extract_tables.py "<pdf_path>" [--page <page_number>] [--format csv|json]
```

Options:
- `--page`: Extract from specific page
- `--format`: Output format (csv or json, default: csv)

### Getting PDF Info

```bash
python3 ~/.claude/skills/doc:pdf/pdf_info.py "<pdf_path>"
```

Returns: page count, metadata, file size

### Creating PDFs

```bash
python3 ~/.claude/skills/doc:pdf/create_pdf.py "<output_path>" --text "<text_content>"
python3 ~/.claude/skills/doc:pdf/create_pdf.py "<output_path>" --html "<html_content>"
python3 ~/.claude/skills/doc:pdf/create_pdf.py "<output_path>" --markdown "<markdown_content>"
```

## Dependencies

This skill requires Python packages. Install with:

```bash
pip install pypdf pdfplumber reportlab markdown
```

## Examples

1. "Read the contents of report.pdf" -> Use read_pdf.py
2. "Extract the table from page 3 of data.pdf" -> Use extract_tables.py with --page 2
3. "How many pages is this PDF?" -> Use pdf_info.py
4. "Create a PDF with this text" -> Use create_pdf.py

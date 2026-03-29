#!/usr/bin/env python3
"""Extract tables from PDF files."""

import argparse
import sys
import json
import csv
import io

def extract_tables(pdf_path: str, page_number: int = None, output_format: str = "csv"):
    """Extract tables from a PDF file."""
    try:
        import pdfplumber
    except ImportError:
        print("Error: pdfplumber not installed. Run: pip install pdfplumber", file=sys.stderr)
        sys.exit(1)

    try:
        with pdfplumber.open(pdf_path) as pdf:
            all_tables = []

            if page_number is not None:
                if page_number < 0 or page_number >= len(pdf.pages):
                    print(f"Error: Page {page_number} out of range. PDF has {len(pdf.pages)} pages.", file=sys.stderr)
                    sys.exit(1)
                pages_to_process = [(page_number, pdf.pages[page_number])]
            else:
                pages_to_process = enumerate(pdf.pages)

            for i, page in pages_to_process:
                tables = page.extract_tables()
                for t_idx, table in enumerate(tables):
                    if table:
                        all_tables.append({
                            "page": i + 1,
                            "table_index": t_idx + 1,
                            "data": table
                        })

            if not all_tables:
                print("No tables found in the PDF.")
                return

            if output_format == "json":
                print(json.dumps(all_tables, indent=2, ensure_ascii=False))
            else:
                for table_info in all_tables:
                    print(f"\n--- Page {table_info['page']}, Table {table_info['table_index']} ---")
                    output = io.StringIO()
                    writer = csv.writer(output)
                    for row in table_info['data']:
                        cleaned_row = [cell if cell else "" for cell in row]
                        writer.writerow(cleaned_row)
                    print(output.getvalue())

    except Exception as e:
        print(f"Error extracting tables: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Extract tables from PDF files")
    parser.add_argument("pdf_path", help="Path to the PDF file")
    parser.add_argument("--page", type=int, help="Specific page to extract from (0-indexed)")
    parser.add_argument("--format", choices=["csv", "json"], default="csv", help="Output format")

    args = parser.parse_args()
    extract_tables(args.pdf_path, args.page, args.format)

if __name__ == "__main__":
    main()

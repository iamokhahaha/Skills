#!/usr/bin/env python3
"""Extract text from PDF files."""

import argparse
import sys

def read_pdf(pdf_path: str, page_number: int = None) -> str:
    """Extract text from a PDF file."""
    try:
        import pdfplumber
    except ImportError:
        print("Error: pdfplumber not installed. Run: pip install pdfplumber", file=sys.stderr)
        sys.exit(1)

    try:
        with pdfplumber.open(pdf_path) as pdf:
            if page_number is not None:
                if page_number < 0 or page_number >= len(pdf.pages):
                    print(f"Error: Page {page_number} out of range. PDF has {len(pdf.pages)} pages.", file=sys.stderr)
                    sys.exit(1)
                text = pdf.pages[page_number].extract_text() or ""
                print(f"--- Page {page_number + 1} ---")
                print(text)
            else:
                for i, page in enumerate(pdf.pages):
                    text = page.extract_text() or ""
                    print(f"--- Page {i + 1} ---")
                    print(text)
                    print()
    except Exception as e:
        print(f"Error reading PDF: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Extract text from PDF files")
    parser.add_argument("pdf_path", help="Path to the PDF file")
    parser.add_argument("--page", type=int, help="Specific page to extract (0-indexed)")

    args = parser.parse_args()
    read_pdf(args.pdf_path, args.page)

if __name__ == "__main__":
    main()

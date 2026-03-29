#!/usr/bin/env python3
"""Get PDF file information and metadata."""

import argparse
import sys
import os
import json

def get_pdf_info(pdf_path: str):
    """Get information about a PDF file."""
    try:
        from pypdf import PdfReader
    except ImportError:
        print("Error: pypdf not installed. Run: pip install pypdf", file=sys.stderr)
        sys.exit(1)

    try:
        file_size = os.path.getsize(pdf_path)

        reader = PdfReader(pdf_path)
        metadata = reader.metadata

        info = {
            "file_path": pdf_path,
            "file_size_bytes": file_size,
            "file_size_human": format_size(file_size),
            "page_count": len(reader.pages),
            "metadata": {}
        }

        if metadata:
            if metadata.title:
                info["metadata"]["title"] = metadata.title
            if metadata.author:
                info["metadata"]["author"] = metadata.author
            if metadata.subject:
                info["metadata"]["subject"] = metadata.subject
            if metadata.creator:
                info["metadata"]["creator"] = metadata.creator
            if metadata.producer:
                info["metadata"]["producer"] = metadata.producer
            if metadata.creation_date:
                info["metadata"]["creation_date"] = str(metadata.creation_date)
            if metadata.modification_date:
                info["metadata"]["modification_date"] = str(metadata.modification_date)

        print(json.dumps(info, indent=2, ensure_ascii=False))

    except Exception as e:
        print(f"Error reading PDF info: {e}", file=sys.stderr)
        sys.exit(1)

def format_size(size_bytes: int) -> str:
    """Format bytes to human readable size."""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"

def main():
    parser = argparse.ArgumentParser(description="Get PDF file information")
    parser.add_argument("pdf_path", help="Path to the PDF file")

    args = parser.parse_args()
    get_pdf_info(args.pdf_path)

if __name__ == "__main__":
    main()

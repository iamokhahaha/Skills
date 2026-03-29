#!/usr/bin/env python3
"""Test XHS comment API using the ReaJason/xhs Python library"""
import json
import sys

try:
    from xhs import XhsClient
except ImportError:
    print("Installing xhs...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "xhs", "-q"])
    from xhs import XhsClient

# Read cookies from file
with open("tmp/xhs-cookies.txt") as f:
    cookie_str = f.read().strip()

print(f"Cookie string length: {len(cookie_str)}")

# Initialize client
client = XhsClient(cookie=cookie_str)

note_id = "69a1c16f000000002800ab0d"  # 571年前 post

print(f"\nTesting get_note_comments for note: {note_id}")
try:
    result = client.get_note_comments(note_id=note_id)
    print(f"Success! Got: {json.dumps(result, ensure_ascii=False)[:1000]}")
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")

# Try with xsec_token empty
print(f"\nTrying with empty xsec_token...")
try:
    result = client.get_note_comments(note_id=note_id, xsec_token="")
    print(f"Success! Got: {json.dumps(result, ensure_ascii=False)[:1000]}")
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")

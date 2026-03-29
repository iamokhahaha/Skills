# Fonts

## Required Fonts

### 1. Noto Sans CJK (中文字体)

**Ubuntu/Debian:**
```bash
sudo apt install fonts-noto-cjk
```

**macOS:**
Already included in system, or download from:
https://fonts.google.com/noto/specimen/Noto+Sans+SC

**Windows:**
Download from Google Fonts or use system fonts (Microsoft YaHei)

### 2. Big Shoulders Display (数字字体，可选)

Download from Google Fonts:
https://fonts.google.com/specimen/Big+Shoulders+Display

Place `BigShoulders-Bold.ttf` in this directory.

If not available, the system will fallback to Noto Sans CJK Bold for numbers.

## Font Index Reference

For `.ttc` (TrueType Collection) files, use these indices:

| Index | Language |
|-------|----------|
| 0 | Japanese (JP) |
| 1 | Korean (KR) |
| 2 | Simplified Chinese (SC) |
| 3 | Traditional Chinese (TC) |
| 4 | Hong Kong (HK) |

The default is index 2 (Simplified Chinese).

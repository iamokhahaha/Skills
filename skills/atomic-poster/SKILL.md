---
name: atomic-poster
description: "课程封面海报生成。三种主题配色（AI课程绿/创业红/技术橙），竖版横版两种尺寸，Python脚本生成。触发词：做海报、poster、生成海报、课程封面、cover image、封面图、generate poster"
---

# Course Poster Generator - SKILL

## 概述

为课程系列创建统一风格的封面海报。支持三种主题配色，竖版(1080x1920)和横版(1920x1080)两种尺寸。

## 目录结构

```text
atomic-poster/
├── SKILL.md
├── README.md
├── LICENSE
├── requirements.txt
├── .gitignore
├── scripts/
│   ├── poster_generator.py    # 海报生成核心脚本
│   └── poster_editor.py       # 可视化图层编辑器
└── assets/
    ├── person.png              # 默认人像素材
    ├── fonts/                  # 字体文件
    ├── templates/              # HTML 模板（editor.html）
    └── examples/               # 示例海报（demo_vertical/horizontal.png）
```

## 主题配色

| 主题 | 背景色 | RGB值 | 用途 |
|------|--------|-------|------|
| **ai_course** | 马石油绿 (Petronas Teal) | (0, 130, 127) | AI工具教程、技术速成课 |
| **build_public** | 法拉利红 (Ferrari Red) | (220, 0, 0) | 创业分享、Build in Public |
| **tech_explain** | 迈凯轮橙 (McLaren Papaya) | (255, 135, 0) | 技术深度解析、论文解读 |

## 设计规范

### 布局结构

```
竖版 (1080x1920):
┌─────────────────────────┐
│      主标题              │  ← 如「玛莎AI公开课」
│      课程名称            │  ← 可选，如「Claude Code」
│  ─────────────────      │  ← 分隔线
│  01  章节标题            │  ← 章节编号 + 章节标题
│                         │
│        [人像]           │  ← 带白色描边的人像，居中偏下
│                         │
└─────────────────────────┘

横版 (1920x1080):
┌────────────────────────────────────────┐
│  主标题                                │
│  课程名称                      [人像]  │
│  ─────────────                         │
│  01                                    │
│  章节标题                              │
│                                        │
└────────────────────────────────────────┘
```

### 字体规范

- 主标题：Noto Sans CJK SC Bold, 110px (竖版) / 115px (横版)
- 课程名称：Noto Sans CJK SC Medium, 58px (竖版) / 62px (横版)
- 章节编号：BigShoulders-Bold, 140px
- 分隔线：白色, 2-3px

### 人像处理

- 使用透明背景 PNG
- 添加纯色白边描边，宽度 6px
- 使用形态学膨胀算法生成干净轮廓

## 使用方法

### 基本调用

```python
from scripts.poster_generator import create_poster

create_poster(
    person_img="assets/person.png",
    theme="ai_course",
    course_name="Claude Code",      # 可选
    chapter_num="01",
    chapter_title="如何安装 Claude Code",
    output_vertical="/path/to/vertical.png",
    output_horizontal="/path/to/horizontal.png",
    main_title="玛莎AI公开课"        # 可选，有默认值
)
```

### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| person_img | str | ✅ | 人像PNG路径（需透明背景） |
| theme | str | ✅ | 主题：ai_course / build_public / tech_explain |
| course_name | str | ❌ | 课程名称，如 "Claude Code"，留空则不显示 |
| chapter_num | str | ✅ | 章节编号，如 "01" |
| chapter_title | str | ✅ | 章节标题，如 "如何安装 Claude Code" |
| main_title | str | ❌ | 主标题，默认 "玛莎AI速成课" |
| sub_headline | str | ❌ | 副标题，显示在章节标题下方 |

## 输出格式

- 格式：PNG
- 竖版尺寸：1080 x 1920 (9:16)
- 横版尺寸：1920 x 1080 (16:9)

## 依赖

- Python 3.8+
- Pillow (PIL)
- NumPy
- Flask (编辑器)

## 图层编辑器

生成海报后可以启动可视化编辑器，在浏览器中调整各元素的位置和大小。

### 启动编辑器

```python
from scripts.poster_editor import start_editor

start_editor(
    person_img="/path/to/person.png",
    theme="ai_course",
    course_name="Claude Code",
    chapter_num="01",
    chapter_title="如何安装 Claude Code",
    main_title="玛莎AI公开课",
    orientation="vertical",  # 或 "horizontal"
    port=5050
)
```

### 命令行启动

```bash
python scripts/poster_editor.py -p assets/person.png -n 01 --title "如何安装" --course "Claude Code"
```

### 编辑器功能

- **拖拽移动**: 直接拖拽文字或图片调整位置
- **调整字号**: 选中文字后通过滑块调整字体大小
- **缩放图片**: 选中人像后调整缩放比例
- **主题切换**: 实时切换三种主题配色
- **方向切换**: 在竖版和横版之间切换
- **键盘微调**: 方向键微调位置，Shift+方向键大步移动
- **导出**: 编辑完成后导出最终 PNG 图片

### 工作流程

1. Claude 生成初始海报配置
2. 自动启动编辑器（浏览器打开 http://localhost:5050）
3. 用户在浏览器中调整布局
4. 点击"导出海报"生成最终图片

## 触发示例

用户说：「帮我做一个 Claude Code 第3课的封面，主题是 Prompt Engineering」

Claude 应该：
1. 确认使用哪个主题配色
2. 使用用户提供的人像或默认人像
3. 生成竖版和横版两个尺寸
4. 设置 chapter_num="03", chapter_title="Prompt Engineering"

# Course Poster Generator Skill

一个为 Claude AI 设计的课程封面海报生成技能，支持多主题配色、竖版/横版双尺寸输出。

![Demo](examples/demo.png)

## 功能特点

- 🎨 **三种主题配色**：马石油绿、法拉利红、迈凯轮橙
- 📐 **双尺寸输出**：竖版 (1080×1920) + 横版 (1920×1080)
- 🖼️ **自动人像处理**：透明背景 PNG 自动添加白色描边
- 🔤 **简体中文优化**：正确渲染简体中文字形
- ⚡ **一键生成**：单个函数调用生成两个尺寸

## 主题配色

| 主题 | 颜色 | RGB | 建议用途 |
|------|------|-----|----------|
| `ai_course` | 马石油绿 (Petronas Teal) | (0, 130, 127) | AI 工具教程、技术速成课 |
| `build_public` | 法拉利红 (Ferrari Red) | (220, 0, 0) | 创业分享、Build in Public |
| `tech_explain` | 迈凯轮橙 (McLaren Papaya) | (255, 135, 0) | 技术深度解析、论文解读 |

## 安装

### 作为 Claude Skill 使用

1. 将 `SKILL.md` 和 `poster_generator.py` 复制到 `/mnt/skills/user/course-poster/`
2. Claude 会自动识别并使用该技能

### 独立使用

```bash
# 克隆仓库
git clone https://github.com/your-username/course-poster-skill.git
cd course-poster-skill

# 安装依赖
pip install pillow numpy
```

## 使用方法

### 基础用法

```python
from poster_generator import create_poster

create_poster(
    person_img="./avatar.png",           # 透明背景人像
    theme="ai_course",                    # 主题配色
    course_name="Claude Code",            # 课程名称（可选）
    chapter_num="01",                     # 章节编号
    chapter_title="如何安装 Claude Code",  # 章节标题
    output_vertical="./vertical.png",    # 竖版输出路径
    output_horizontal="./horizontal.png", # 横版输出路径
    main_title="玛莎AI公开课"              # 主标题
)
```

### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `person_img` | str | ✅ | 人像 PNG 路径（需透明背景）|
| `theme` | str | ✅ | 主题：`ai_course` / `build_public` / `tech_explain` |
| `course_name` | str | ❌ | 课程名称，显示在主标题下方 |
| `chapter_num` | str | ✅ | 章节编号，如 "01" |
| `chapter_title` | str | ✅ | 章节标题 |
| `output_vertical` | str | ✅ | 竖版输出路径 |
| `output_horizontal` | str | ✅ | 横版输出路径 |
| `main_title` | str | ❌ | 主标题，默认 "玛莎AI速成课" |
| `sub_headline` | str | ❌ | 副标题，显示在章节标题下方 |

### 与 Claude 对话使用

当此技能安装后，你可以直接告诉 Claude：

> "帮我生成一个课程封面，主题是 AI 速成课，章节 01，标题是如何安装 Claude Code"

Claude 会自动调用技能生成海报。

## 布局结构

```
竖版 (1080×1920)                    横版 (1920×1080)
┌─────────────────────┐            ┌────────────────────────────────┐
│    玛莎AI公开课      │            │ 玛莎AI公开课                    │
│    Claude Code      │            │ Claude Code          [人像]    │
│    ─────────────    │            │ ─────────────                  │
│ 01  如何安装...      │            │ 01                             │
│                     │            │ 如何安装 Claude Code            │
│      [人像]         │            │                                │
│                     │            │ ─────                          │
└─────────────────────┘            └────────────────────────────────┘
```

## 字体要求

需要系统安装以下字体：

- **Noto Sans CJK SC** - 简体中文（Ubuntu 默认包含）
- **BigShoulders-Bold** - 数字显示（需额外安装或放在 fonts 目录）

Ubuntu 安装中文字体：

```bash
sudo apt install fonts-noto-cjk
```

## 示例

### 生成 AI 教程封面（绿色）

```python
create_poster(
    person_img="avatar.png",
    theme="ai_course",
    chapter_num="01",
    chapter_title="Claude Code 安装指南",
    output_vertical="output_v.png",
    output_horizontal="output_h.png",
    main_title="玛莎AI公开课"
)
```

### 生成 Build in Public 封面（红色）

```python
create_poster(
    person_img="avatar.png",
    theme="build_public",
    course_name="NoteLLM",
    chapter_num="01",
    chapter_title="搭建复刻 NoteLLM",
    output_vertical="output_v.png",
    output_horizontal="output_h.png",
    main_title="玛莎AI速成课"
)
```

### 生成技术解读封面（橙色）

```python
create_poster(
    person_img="avatar.png",
    theme="tech_explain",
    course_name="Claude Skills",
    chapter_num="01",
    chapter_title="Skills 技术详解",
    output_vertical="output_v.png",
    output_horizontal="output_h.png",
    main_title="玛莎AI速成课"
)
```

## 项目结构

```
course-poster-skill/
├── SKILL.md              # Claude Skill 描述文件
├── poster_generator.py   # 核心生成代码
├── README.md             # 项目说明
├── requirements.txt      # Python 依赖
├── fonts/                # 字体文件（可选）
│   └── BigShoulders-Bold.ttf
└── examples/             # 示例图片
    ├── demo.png
    ├── vertical_green.png
    ├── vertical_red.png
    └── vertical_orange.png
```

## 依赖

- Python 3.8+
- Pillow >= 9.0.0
- NumPy >= 1.20.0

## License

MIT License

## 致谢

- 配色灵感来自 F1 车队（Mercedes、Ferrari、McLaren）
- 字体使用 Google Noto Sans CJK

#!/usr/bin/env python3
"""
Course Poster Generator
课程封面海报生成器 - 支持三种主题配色，竖版和横版两种尺寸

Author: Marshall
License: MIT
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
import numpy as np

# ============ 主题配色 ============
THEMES = {
    "ai_course": (0, 130, 127),       # 马石油绿 (Petronas Teal) - AI速成课
    "build_public": (220, 0, 0),       # 法拉利红 (Ferrari Red) - Build in Public
    "tech_explain": (255, 135, 0),     # 迈凯轮橙 (McLaren Papaya) - AI技术解读
}

# 通用颜色
WHITE = (255, 255, 255)

# ============ 字体配置 ============
# 字体路径 - 根据系统调整
# Ubuntu/Debian: /usr/share/fonts/opentype/noto/
# macOS: /System/Library/Fonts/ 或 /Library/Fonts/
# Windows: C:/Windows/Fonts/

def get_font_path():
    """自动检测系统字体路径"""
    possible_paths = [
        # Ubuntu/Debian
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc",
        # macOS
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
        # Windows
        "C:/Windows/Fonts/msyh.ttc",  # 微软雅黑
        "C:/Windows/Fonts/simhei.ttf",  # 黑体
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            return os.path.dirname(path)
    
    return None

# 字体路径 - 自动检测系统
import platform

def _get_system_fonts():
    """根据操作系统获取字体路径"""
    system = platform.system()

    if system == "Darwin":  # macOS
        # PingFang SC 是 macOS 内置的简体中文字体
        return (
            "/System/Library/Fonts/PingFang.ttc",
            "/System/Library/Fonts/PingFang.ttc",
            0  # PingFang SC Regular
        )
    elif system == "Windows":
        return (
            "C:/Windows/Fonts/msyh.ttc",
            "C:/Windows/Fonts/msyh.ttc",
            0
        )
    else:  # Linux
        return (
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc",
            2  # SC简体中文在ttc中的索引
        )

NOTO_SANS_BOLD, NOTO_SANS_MEDIUM, FONT_INDEX = _get_system_fonts()

# BigShoulders 字体路径 - 用于数字显示
# 可以从 Google Fonts 下载: https://fonts.google.com/specimen/Big+Shoulders+Display
BIG_SHOULDERS_FONT = None  # 设置为 None 时使用系统默认粗体

def _get_number_font(size):
    """获取数字字体，优先使用 BigShoulders，否则使用系统粗体"""
    if BIG_SHOULDERS_FONT and os.path.exists(BIG_SHOULDERS_FONT):
        return ImageFont.truetype(BIG_SHOULDERS_FONT, size)
    else:
        # 回退到系统粗体
        return ImageFont.truetype(NOTO_SANS_BOLD, size, index=FONT_INDEX)


def add_white_outline(img, outline_width=6):
    """
    为PNG图像添加纯色白边描边
    
    Args:
        img: PIL Image 对象（需要 RGBA 模式）
        outline_width: 描边宽度，默认 6px
    
    Returns:
        带白色描边的 PIL Image 对象
    """
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    alpha = img.split()[3]
    padding = outline_width + 5
    new_width = img.width + padding * 2
    new_height = img.height + padding * 2
    
    # 创建二值化 mask
    alpha_np = np.array(alpha)
    binary_mask = (alpha_np > 128).astype(np.uint8) * 255
    mask_img = Image.fromarray(binary_mask, mode='L')
    
    # 形态学膨胀
    dilated = mask_img
    for _ in range(outline_width // 2):
        dilated = dilated.filter(ImageFilter.MaxFilter(5))
    
    # 扩展画布
    expanded_dilated = Image.new('L', (new_width, new_height), 0)
    expanded_dilated.paste(dilated, (padding, padding))
    
    # 创建白色描边层
    outline_layer = Image.new('RGBA', (new_width, new_height), (0, 0, 0, 0))
    white_fill = Image.new('RGBA', (new_width, new_height), WHITE + (255,))
    outline_layer.paste(white_fill, (0, 0), expanded_dilated)
    
    # 合成原图
    expanded_original = Image.new('RGBA', (new_width, new_height), (0, 0, 0, 0))
    expanded_original.paste(img, (padding, padding), img)
    
    result = Image.alpha_composite(outline_layer, expanded_original)
    return result


def create_vertical_poster(
    person_img_path, 
    theme, 
    course_name, 
    chapter_num, 
    chapter_title, 
    output_path, 
    main_title="玛莎AI速成课", 
    sub_headline=None
):
    """
    创建竖版海报 (1080x1920)
    
    Args:
        person_img_path: 人像PNG路径（需透明背景）
        theme: 主题 (ai_course/build_public/tech_explain)
        course_name: 课程名称，如 "Claude Code"，留空则不显示
        chapter_num: 章节编号，如 "01"
        chapter_title: 章节标题，如 "如何安装 Claude Code"
        output_path: 输出路径
        main_title: 主标题，默认"玛莎AI速成课"
        sub_headline: 副标题（显示在章节标题下方），可选
    """
    width, height = 1080, 1920
    bg_color = THEMES.get(theme, THEMES["ai_course"])
    
    poster = Image.new('RGB', (width, height), bg_color)
    draw = ImageDraw.Draw(poster)
    
    # 加载字体
    font_title = ImageFont.truetype(NOTO_SANS_BOLD, 110, index=FONT_INDEX)
    font_subtitle = ImageFont.truetype(NOTO_SANS_MEDIUM, 58, index=FONT_INDEX)
    font_number = _get_number_font(140)
    
    # 处理人像
    person_img = Image.open(person_img_path).convert('RGBA')
    person_with_outline = add_white_outline(person_img, outline_width=6)
    
    person_height = int(height * 0.62)
    ratio = person_height / person_with_outline.height
    person_width = int(person_with_outline.width * ratio)
    person_resized = person_with_outline.resize((person_width, person_height), Image.Resampling.LANCZOS)
    
    person_x = (width - person_width) // 2
    person_y = height - person_height + 40
    
    poster_rgba = poster.convert('RGBA')
    poster_rgba.paste(person_resized, (person_x, person_y), person_resized)
    poster = poster_rgba.convert('RGB')
    draw = ImageDraw.Draw(poster)
    
    # ===== 文字排版 =====
    title_y = 100
    
    # 主标题
    main_title_bbox = draw.textbbox((0, 0), main_title, font=font_title)
    main_title_width = main_title_bbox[2] - main_title_bbox[0]
    main_title_x = (width - main_title_width) // 2
    draw.text((main_title_x, title_y), main_title, font=font_title, fill=WHITE)
    
    # 课程名称（可选）
    if course_name:
        theme_bbox = draw.textbbox((0, 0), course_name, font=font_subtitle)
        theme_width = theme_bbox[2] - theme_bbox[0]
        theme_x = (width - theme_width) // 2
        theme_y = title_y + 160
        draw.text((theme_x, theme_y), course_name, font=font_subtitle, fill=WHITE)
        line_y = theme_y + 100
    else:
        line_y = title_y + 160
    
    # 分隔线
    line_margin = 100
    draw.line([(line_margin, line_y), (width - line_margin, line_y)], fill=WHITE, width=2)
    
    # 章节编号和标题
    number_y = line_y + 50
    number_x = 100
    draw.text((number_x, number_y), chapter_num, font=font_number, fill=WHITE)
    
    subtitle_y = number_y + 30
    subtitle_x = number_x + 180
    draw.text((subtitle_x, subtitle_y), chapter_title, font=font_subtitle, fill=WHITE)
    
    # 副标题（如果有）
    if sub_headline:
        font_small = ImageFont.truetype(NOTO_SANS_MEDIUM, 42, index=FONT_INDEX)
        sub_y = subtitle_y + 80
        draw.text((subtitle_x, sub_y), sub_headline, font=font_small, fill=WHITE)
    
    poster.save(output_path, 'PNG', quality=95)
    print(f"竖版海报已保存: {output_path}")


def create_horizontal_poster(
    person_img_path, 
    theme, 
    course_name, 
    chapter_num, 
    chapter_title, 
    output_path, 
    main_title="玛莎AI速成课", 
    sub_headline=None
):
    """
    创建横版海报 (1920x1080)
    
    Args:
        person_img_path: 人像PNG路径（需透明背景）
        theme: 主题 (ai_course/build_public/tech_explain)
        course_name: 课程名称，如 "Claude Code"，留空则不显示
        chapter_num: 章节编号，如 "01"
        chapter_title: 章节标题，如 "如何安装 Claude Code"
        output_path: 输出路径
        main_title: 主标题，默认"玛莎AI速成课"
        sub_headline: 副标题（显示在章节标题下方），可选
    """
    width, height = 1920, 1080
    bg_color = THEMES.get(theme, THEMES["ai_course"])
    
    poster = Image.new('RGB', (width, height), bg_color)
    draw = ImageDraw.Draw(poster)
    
    # 加载字体
    font_title = ImageFont.truetype(NOTO_SANS_BOLD, 115, index=FONT_INDEX)
    font_subtitle = ImageFont.truetype(NOTO_SANS_MEDIUM, 62, index=FONT_INDEX)
    font_number = _get_number_font(140)
    
    # 处理人像
    person_img = Image.open(person_img_path).convert('RGBA')
    person_with_outline = add_white_outline(person_img, outline_width=6)
    
    person_height = int(height * 0.95)
    ratio = person_height / person_with_outline.height
    person_width = int(person_with_outline.width * ratio)
    person_resized = person_with_outline.resize((person_width, person_height), Image.Resampling.LANCZOS)
    
    person_x = width - person_width + 50
    person_y = height - person_height + 30
    
    poster_rgba = poster.convert('RGBA')
    poster_rgba.paste(person_resized, (person_x, person_y), person_resized)
    poster = poster_rgba.convert('RGB')
    draw = ImageDraw.Draw(poster)
    
    # ===== 文字排版 =====
    left_margin = 120
    title_y = 150
    
    # 主标题
    draw.text((left_margin, title_y), main_title, font=font_title, fill=WHITE)
    
    # 课程名称（可选）
    if course_name:
        theme_y = title_y + 170
        draw.text((left_margin, theme_y), course_name, font=font_subtitle, fill=WHITE)
        line_y = theme_y + 110
    else:
        line_y = title_y + 170
    
    # 分隔线
    draw.line([(left_margin, line_y), (left_margin + 600, line_y)], fill=WHITE, width=3)
    
    # 章节编号和标题
    number_y = line_y + 60
    draw.text((left_margin, number_y), chapter_num, font=font_number, fill=WHITE)
    
    subtitle_y = number_y + 160
    draw.text((left_margin, subtitle_y), chapter_title, font=font_subtitle, fill=WHITE)
    
    # 副标题（如果有）
    if sub_headline:
        font_small = ImageFont.truetype(NOTO_SANS_MEDIUM, 46, index=FONT_INDEX)
        sub_y = subtitle_y + 80
        draw.text((left_margin, sub_y), sub_headline, font=font_small, fill=WHITE)
    
    # 底部装饰线
    bottom_line_y = height - 80
    draw.line([(left_margin, bottom_line_y), (left_margin + 400, bottom_line_y)], fill=WHITE, width=2)
    
    poster.save(output_path, 'PNG', quality=95)
    print(f"横版海报已保存: {output_path}")


def create_poster(
    person_img,
    theme,
    course_name,
    chapter_num,
    chapter_title,
    output_vertical,
    output_horizontal,
    main_title="玛莎AI速成课",
    sub_headline=None,
    open_editor=False,
    editor_orientation="vertical"
):
    """
    一键生成竖版和横版海报

    Args:
        person_img: 人像PNG路径（需透明背景）
        theme: 主题 (ai_course/build_public/tech_explain)
        course_name: 课程名称，留空则不显示
        chapter_num: 章节编号
        chapter_title: 章节标题
        output_vertical: 竖版输出路径
        output_horizontal: 横版输出路径
        main_title: 主标题，默认"玛莎AI速成课"
        sub_headline: 副标题，可选
        open_editor: 是否打开图层编辑器（默认 False）
        editor_orientation: 编辑器初始方向 ("vertical" 或 "horizontal")

    Example:
        create_poster(
            person_img="./avatar.png",
            theme="ai_course",
            course_name="Claude Code",
            chapter_num="01",
            chapter_title="如何安装 Claude Code",
            output_vertical="./vertical.png",
            output_horizontal="./horizontal.png",
            main_title="玛莎AI公开课",
            open_editor=True  # 生成后打开编辑器
        )
    """
    create_vertical_poster(
        person_img, theme, course_name, chapter_num, chapter_title,
        output_vertical, main_title, sub_headline
    )
    create_horizontal_poster(
        person_img, theme, course_name, chapter_num, chapter_title,
        output_horizontal, main_title, sub_headline
    )

    # 如果需要打开编辑器
    if open_editor:
        from poster_editor import start_editor
        print("\n正在启动图层编辑器...")
        start_editor(
            person_img=person_img,
            theme=theme,
            course_name=course_name,
            chapter_num=chapter_num,
            chapter_title=chapter_title,
            main_title=main_title,
            sub_headline=sub_headline,
            orientation=editor_orientation
        )


# ============ 命令行支持 ============
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="课程封面海报生成器")
    parser.add_argument("--person", "-p", required=True, help="人像PNG路径（需透明背景）")
    parser.add_argument("--theme", "-t", default="ai_course", 
                        choices=["ai_course", "build_public", "tech_explain"],
                        help="主题配色")
    parser.add_argument("--course", "-c", default="", help="课程名称")
    parser.add_argument("--num", "-n", required=True, help="章节编号")
    parser.add_argument("--title", required=True, help="章节标题")
    parser.add_argument("--main-title", "-m", default="玛莎AI速成课", help="主标题")
    parser.add_argument("--output", "-o", default="./output", help="输出目录")
    
    args = parser.parse_args()
    
    os.makedirs(args.output, exist_ok=True)
    
    create_poster(
        person_img=args.person,
        theme=args.theme,
        course_name=args.course,
        chapter_num=args.num,
        chapter_title=args.title,
        output_vertical=os.path.join(args.output, "poster_vertical.png"),
        output_horizontal=os.path.join(args.output, "poster_horizontal.png"),
        main_title=args.main_title
    )

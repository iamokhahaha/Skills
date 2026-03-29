#!/usr/bin/env python3
"""
Poster Layer Editor
封面海报图层编辑器 - 提供可视化编辑界面

Author: Marshall
License: MIT
"""

import os
import json
import base64
import webbrowser
import threading
from io import BytesIO
from flask import Flask, render_template, request, jsonify, send_file
from PIL import Image, ImageDraw, ImageFont
import numpy as np

from poster_generator import (
    THEMES, WHITE, NOTO_SANS_BOLD, NOTO_SANS_MEDIUM,
    FONT_INDEX, add_white_outline, _get_number_font
)

app = Flask(__name__, template_folder='templates', static_folder='static')

# 全局状态存储当前编辑的海报配置
current_config = {}


def image_to_base64(img):
    """将 PIL Image 转换为 base64 字符串"""
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


def load_person_image(path, outline_width=6):
    """加载并处理人像图片"""
    person_img = Image.open(path).convert('RGBA')
    person_with_outline = add_white_outline(person_img, outline_width=outline_width)
    return person_with_outline


@app.route('/')
def editor():
    """渲染编辑器页面"""
    return render_template('editor.html', config=current_config)


@app.route('/api/config')
def get_config():
    """获取当前配置"""
    return jsonify(current_config)


@app.route('/api/update', methods=['POST'])
def update_config():
    """更新配置"""
    global current_config
    data = request.json

    # 更新各图层配置
    if 'layers' in data:
        current_config['layers'] = data['layers']

    return jsonify({'status': 'ok'})


@app.route('/api/export', methods=['POST'])
def export_poster():
    """根据编辑后的配置导出最终海报"""
    global current_config
    data = request.json

    # 获取导出参数
    orientation = data.get('orientation', 'vertical')
    output_path = data.get('output_path', './output')

    if orientation == 'vertical':
        width, height = 1080, 1920
    else:
        width, height = 1920, 1080

    # 获取主题颜色
    theme = current_config.get('theme', 'ai_course')
    bg_color = THEMES.get(theme, THEMES["ai_course"])

    # 创建画布
    poster = Image.new('RGB', (width, height), bg_color)
    draw = ImageDraw.Draw(poster)

    # 获取图层配置
    layers = data.get('layers', current_config.get('layers', []))

    # 按 z-index 排序图层
    layers_sorted = sorted(layers, key=lambda x: x.get('zIndex', 0))

    for layer in layers_sorted:
        layer_type = layer.get('type')

        if layer_type == 'text':
            # 渲染文字图层
            text = layer.get('text', '')
            x = int(layer.get('x', 0))
            y = int(layer.get('y', 0))
            font_size = int(layer.get('fontSize', 48))
            font_weight = layer.get('fontWeight', 'bold')

            if font_weight == 'bold':
                font = ImageFont.truetype(NOTO_SANS_BOLD, font_size, index=FONT_INDEX)
            elif font_weight == 'number':
                font = _get_number_font(font_size)
            else:
                font = ImageFont.truetype(NOTO_SANS_MEDIUM, font_size, index=FONT_INDEX)

            draw.text((x, y), text, font=font, fill=WHITE)

        elif layer_type == 'image':
            # 渲染图片图层
            img_path = layer.get('src', '')
            x = int(layer.get('x', 0))
            y = int(layer.get('y', 0))
            scale = float(layer.get('scale', 1.0))

            if os.path.exists(img_path):
                img = load_person_image(img_path)
                new_width = int(img.width * scale)
                new_height = int(img.height * scale)
                img_resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

                poster_rgba = poster.convert('RGBA')
                poster_rgba.paste(img_resized, (x, y), img_resized)
                poster = poster_rgba.convert('RGB')
                draw = ImageDraw.Draw(poster)

        elif layer_type == 'line':
            # 渲染分隔线
            x1 = int(layer.get('x1', 0))
            y1 = int(layer.get('y1', 0))
            x2 = int(layer.get('x2', 0))
            y2 = int(layer.get('y2', 0))
            line_width = int(layer.get('lineWidth', 2))

            draw.line([(x1, y1), (x2, y2)], fill=WHITE, width=line_width)

    # 保存文件
    os.makedirs(output_path, exist_ok=True)
    filename = f"poster_{orientation}.png"
    full_path = os.path.join(output_path, filename)
    poster.save(full_path, 'PNG', quality=95)

    return jsonify({
        'status': 'ok',
        'path': full_path,
        'message': f'海报已导出: {full_path}'
    })


@app.route('/api/person-image')
def get_person_image():
    """获取处理后的人像图片（带白边）"""
    path = current_config.get('person_img', '')
    if path and os.path.exists(path):
        img = load_person_image(path)
        return jsonify({
            'base64': image_to_base64(img),
            'width': img.width,
            'height': img.height
        })
    return jsonify({'error': 'Image not found'})


def init_config(
    person_img,
    theme,
    course_name,
    chapter_num,
    chapter_title,
    main_title="玛莎AI速成课",
    sub_headline=None,
    orientation="vertical"
):
    """初始化编辑器配置"""
    global current_config

    if orientation == "vertical":
        width, height = 1080, 1920
        # 竖版布局
        layers = [
            {
                'id': 'main_title',
                'type': 'text',
                'name': '主标题',
                'text': main_title,
                'x': 540,  # 居中
                'y': 100,
                'fontSize': 110,
                'fontWeight': 'bold',
                'align': 'center'
            },
            {
                'id': 'course_name',
                'type': 'text',
                'name': '课程名称',
                'text': course_name or '',
                'x': 540,
                'y': 260,
                'fontSize': 58,
                'fontWeight': 'medium',
                'align': 'center',
                'visible': bool(course_name)
            },
            {
                'id': 'divider',
                'type': 'line',
                'name': '分隔线',
                'x1': 100,
                'y1': 360 if course_name else 260,
                'x2': 980,
                'y2': 360 if course_name else 260,
                'lineWidth': 2
            },
            {
                'id': 'chapter_num',
                'type': 'text',
                'name': '章节编号',
                'text': chapter_num,
                'x': 100,
                'y': 410 if course_name else 310,
                'fontSize': 140,
                'fontWeight': 'number'
            },
            {
                'id': 'chapter_title',
                'type': 'text',
                'name': '章节标题',
                'text': chapter_title,
                'x': 280,
                'y': 440 if course_name else 340,
                'fontSize': 58,
                'fontWeight': 'medium'
            },
            {
                'id': 'person',
                'type': 'image',
                'name': '人像',
                'src': person_img,
                'x': 200,
                'y': 730,
                'scale': 0.6,
                'zIndex': 10
            }
        ]

        if sub_headline:
            layers.append({
                'id': 'sub_headline',
                'type': 'text',
                'name': '副标题',
                'text': sub_headline,
                'x': 280,
                'y': 520 if course_name else 420,
                'fontSize': 42,
                'fontWeight': 'medium'
            })
    else:
        width, height = 1920, 1080
        # 横版布局
        layers = [
            {
                'id': 'main_title',
                'type': 'text',
                'name': '主标题',
                'text': main_title,
                'x': 120,
                'y': 150,
                'fontSize': 115,
                'fontWeight': 'bold'
            },
            {
                'id': 'course_name',
                'type': 'text',
                'name': '课程名称',
                'text': course_name or '',
                'x': 120,
                'y': 320,
                'fontSize': 62,
                'fontWeight': 'medium',
                'visible': bool(course_name)
            },
            {
                'id': 'divider',
                'type': 'line',
                'name': '分隔线',
                'x1': 120,
                'y1': 430 if course_name else 320,
                'x2': 720,
                'y2': 430 if course_name else 320,
                'lineWidth': 3
            },
            {
                'id': 'chapter_num',
                'type': 'text',
                'name': '章节编号',
                'text': chapter_num,
                'x': 120,
                'y': 490 if course_name else 380,
                'fontSize': 140,
                'fontWeight': 'number'
            },
            {
                'id': 'chapter_title',
                'type': 'text',
                'name': '章节标题',
                'text': chapter_title,
                'x': 120,
                'y': 650 if course_name else 540,
                'fontSize': 62,
                'fontWeight': 'medium'
            },
            {
                'id': 'person',
                'type': 'image',
                'name': '人像',
                'src': person_img,
                'x': 1200,
                'y': 50,
                'scale': 0.85,
                'zIndex': 10
            },
            {
                'id': 'bottom_line',
                'type': 'line',
                'name': '底部装饰线',
                'x1': 120,
                'y1': 1000,
                'x2': 520,
                'y2': 1000,
                'lineWidth': 2
            }
        ]

        if sub_headline:
            layers.append({
                'id': 'sub_headline',
                'type': 'text',
                'name': '副标题',
                'text': sub_headline,
                'x': 120,
                'y': 730 if course_name else 620,
                'fontSize': 46,
                'fontWeight': 'medium'
            })

    current_config = {
        'person_img': person_img,
        'theme': theme,
        'course_name': course_name,
        'chapter_num': chapter_num,
        'chapter_title': chapter_title,
        'main_title': main_title,
        'sub_headline': sub_headline,
        'orientation': orientation,
        'width': width,
        'height': height,
        'layers': layers
    }

    return current_config


def start_editor(
    person_img,
    theme,
    course_name,
    chapter_num,
    chapter_title,
    main_title="玛莎AI速成课",
    sub_headline=None,
    orientation="vertical",
    port=5050,
    open_browser=True
):
    """
    启动图层编辑器

    Args:
        person_img: 人像PNG路径
        theme: 主题
        course_name: 课程名称
        chapter_num: 章节编号
        chapter_title: 章节标题
        main_title: 主标题
        sub_headline: 副标题
        orientation: 方向 (vertical/horizontal)
        port: 服务端口
        open_browser: 是否自动打开浏览器
    """
    init_config(
        person_img=person_img,
        theme=theme,
        course_name=course_name,
        chapter_num=chapter_num,
        chapter_title=chapter_title,
        main_title=main_title,
        sub_headline=sub_headline,
        orientation=orientation
    )

    url = f"http://localhost:{port}"
    print(f"\n{'='*50}")
    print(f"封面海报编辑器已启动!")
    print(f"请在浏览器中打开: {url}")
    print(f"按 Ctrl+C 退出")
    print(f"{'='*50}\n")

    if open_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    app.run(host='0.0.0.0', port=port, debug=False)


# ============ 命令行支持 ============
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="封面海报图层编辑器")
    parser.add_argument("--person", "-p", required=True, help="人像PNG路径")
    parser.add_argument("--theme", "-t", default="ai_course",
                        choices=["ai_course", "build_public", "tech_explain"])
    parser.add_argument("--course", "-c", default="", help="课程名称")
    parser.add_argument("--num", "-n", required=True, help="章节编号")
    parser.add_argument("--title", required=True, help="章节标题")
    parser.add_argument("--main-title", "-m", default="玛莎AI速成课", help="主标题")
    parser.add_argument("--orientation", "-o", default="vertical",
                        choices=["vertical", "horizontal"], help="海报方向")
    parser.add_argument("--port", type=int, default=5050, help="服务端口")
    parser.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")

    args = parser.parse_args()

    start_editor(
        person_img=args.person,
        theme=args.theme,
        course_name=args.course,
        chapter_num=args.num,
        chapter_title=args.title,
        main_title=args.main_title,
        orientation=args.orientation,
        port=args.port,
        open_browser=not args.no_browser
    )

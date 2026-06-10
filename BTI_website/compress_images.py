#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
图片批量压缩脚本
用法：python compress_images.py
功能：将 images/ 目录下的 JPG 图片压缩到指定质量，减小体积

前置条件：安装 Pillow
  pip install Pillow
"""

import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("[x] 缺少 Pillow 库，请先安装: pip install Pillow")
    sys.exit(1)

IMAGE_DIR = Path(__file__).parent / "images"
QUALITY = 75  # 压缩质量 (1-100)，75 是视觉质量和体积的平衡点
MAX_WIDTH = 800  # 最大宽度，超过则等比缩放

def compress_image(src_path, dst_path):
    """压缩单张图片"""
    img = Image.open(src_path)

    # 如果是 RGBA 模式，转换为 RGB
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    # 等比缩放（如果超过最大宽度）
    width, height = img.size
    if width > MAX_WIDTH:
        ratio = MAX_WIDTH / width
        new_size = (MAX_WIDTH, int(height * ratio))
        img = img.resize(new_size, Image.Resampling.LANCZOS)

    # 保存为 JPEG 并压缩
    img.save(dst_path, "JPEG", quality=QUALITY, optimize=True)

def main():
    if not IMAGE_DIR.exists():
        print(f"[x] 图片目录不存在: {IMAGE_DIR}")
        sys.exit(1)

    jpg_files = list(IMAGE_DIR.glob("*.jpg")) + list(IMAGE_DIR.glob("*.JPG"))
    if not jpg_files:
        print("[!] 未找到 JPG 图片")
        sys.exit(0)

    print(f"[i] 找到 {len(jpg_files)} 张图片，开始压缩...")
    print(f"[i] 压缩质量: {QUALITY}，最大宽度: {MAX_WIDTH}px")

    total_before = 0
    total_after = 0

    for src_path in jpg_files:
        # 创建备份目录
        backup_dir = IMAGE_DIR / "original_backup"
        backup_dir.mkdir(exist_ok=True)

        # 备份原图
        backup_path = backup_dir / src_path.name
        if not backup_path.exists():
            import shutil
            shutil.copy2(src_path, backup_path)

        before_size = src_path.stat().st_size
        total_before += before_size

        # 压缩并覆盖原文件
        compress_image(src_path, src_path)

        after_size = src_path.stat().st_size
        total_after += after_size

        saved = before_size - after_size
        pct = saved / before_size * 100 if before_size > 0 else 0
        print(f"  [+] {src_path.name}: {before_size/1024:.0f}KB → {after_size/1024:.0f}KB (节省 {pct:.0f}%)")

    total_saved = total_before - total_after
    total_pct = total_saved / total_before * 100 if total_before > 0 else 0
    print(f"\n[+] 压缩完成！")
    print(f"    原体积: {total_before/1024/1024:.1f}MB")
    print(f"    压缩后: {total_after/1024/1024:.1f}MB")
    print(f"    节省: {total_saved/1024/1024:.1f}MB ({total_pct:.0f}%)")
    print(f"\n[i] 原图已备份到 images/original_backup/")

if __name__ == "__main__":
    main()

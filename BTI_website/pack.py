#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""打包 BTI 项目为 zip
用法: python pack.py [源目录] [版本号]
  例如: python pack.py dist v3.4    # 打包 dist 目录
        python pack.py . v3.3        # 打包当前目录（开发版）
"""
import zipfile
import os
import sys

base_dir = sys.argv[1] if len(sys.argv) > 1 else '.'
version = sys.argv[2] if len(sys.argv) > 2 else 'latest'
zip_path = f'../BTI_{version}.zip'

print(f'[i] 打包源目录: {base_dir}')
print(f'[i] 输出文件: {zip_path}')

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(base_dir):
        # 跳过排除目录
        dirs[:] = [d for d in dirs if d not in ('.claude', 'dist', 'versions', '__pycache__')]
        for file in files:
            if file.endswith('.log') or file.endswith('.py'):
                continue
            file_path = os.path.join(root, file)
            arcname = os.path.relpath(file_path, base_dir)
            zf.write(file_path, arcname)
            print(f'  + {arcname}')

size = os.path.getsize(zip_path)
print(f'\n[+] 打包完成: {zip_path}')
print(f'    文件大小: {size / 1024 / 1024:.1f} MB ({size:,} bytes)')

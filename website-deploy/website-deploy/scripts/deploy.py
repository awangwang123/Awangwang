#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
网站一键部署脚本 — 阿里云服务器
功能：解压 → 完整性检查 → 并发上传 → 验证
解决：中文路径、环境检测、路径兼容、并发加速
"""

import os
import sys
import re
import json
import shutil
import zipfile
import subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin

# ============ 配置 ============
HOST = "8.148.82.169"
PORT = 22
USER = "root"
PASS = "Pb52013145"
REMOTE_ROOT = "/var/www/html"
TEMP_BASE = Path.home() / ".claude_deploy_temp"
# =============================

def log(msg, level="INFO"):
    prefix = {"INFO": "[i]", "OK": "[+]", "WARN": "[!]", "ERR": "[x]", "CHK": "[*]"}
    print(f"{prefix.get(level, '[?]')} {msg}", flush=True)

def ensure_paramiko():
    """确保 paramiko 已安装"""
    try:
        import paramiko
        return paramiko
    except ImportError:
        log("paramiko 未安装，正在安装...", "WARN")
        # 尝试多个 pip 命令
        for cmd in ["pip install paramiko -q", "python -m pip install paramiko -q"]:
            try:
                subprocess.run(cmd, shell=True, check=True, capture_output=True)
                import paramiko
                log("paramiko 安装成功", "OK")
                return paramiko
            except Exception:
                continue
        log("paramiko 安装失败，请手动运行: pip install paramiko", "ERR")
        sys.exit(1)

def get_python_cmd():
    """检测可用的 Python 解释器"""
    for cmd in ["python", "py", "python3"]:
        try:
            result = subprocess.run(
                f'{cmd} -c "import sys; print(sys.executable)"',
                shell=True, capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                exe = result.stdout.strip()
                # 排除 Windows 商店版（路径含 WindowsApps）
                if "WindowsApps" not in exe:
                    return cmd, exe
        except Exception:
            continue
    return "python", None

def extract_zip(zip_path, extract_to):
    """解压 zip，处理 Windows 反斜杠路径"""
    log(f"解压: {zip_path}")
    with zipfile.ZipFile(zip_path, 'r') as z:
        for member in z.namelist():
            # 修复 Windows 反斜杠路径
            fixed = member.replace("\\", "/")
            target = extract_to / fixed
            target.parent.mkdir(parents=True, exist_ok=True)
            if not member.endswith(("/", "\\")):
                with z.open(member) as src, open(target, 'wb') as dst:
                    shutil.copyfileobj(src, dst)
    log(f"解压完成 -> {extract_to}", "OK")
    return extract_to

def find_site_root(extract_dir):
    """找到包含 index.html 的目录（处理 zip 根目录包裹）"""
    candidates = []
    for root, dirs, files in os.walk(extract_dir):
        if "index.html" in files:
            # 找最浅的目录
            depth = len(Path(root).relative_to(extract_dir).parts)
            candidates.append((depth, root))
    if not candidates:
        return None
    candidates.sort()
    return Path(candidates[0][1])

def check_integrity(site_dir):
    """文件完整性检查"""
    log("开始文件完整性检查...", "CHK")
    issues = []

    # 1. index.html 必须存在
    index_html = site_dir / "index.html"
    if not index_html.exists():
        issues.append("缺少 index.html（主入口文件）")
        return False, issues
    log("  index.html 存在", "OK")

    # 2. 读取 HTML 内容分析资源引用
    try:
        content = index_html.read_text(encoding='utf-8')
    except Exception as e:
        issues.append(f"无法读取 index.html: {e}")
        return False, issues

    # 3. 检查图片引用 vs 实际文件
    # 匹配 src="images/xxx.jpg" 或 'images/xxx.jpg'
    img_refs = set(re.findall(r'["\'](images/[^"\']+)["\']', content))
    log(f"  HTML 引用图片: {len(img_refs)} 个")

    missing_imgs = []
    for ref in img_refs:
        img_path = site_dir / ref.replace("/", os.sep)
        if not img_path.exists():
            missing_imgs.append(ref)

    if missing_imgs:
        issues.append(f"HTML 引用了 {len(missing_imgs)} 个不存在的图片: {', '.join(missing_imgs[:5])}")

    # 4. 检查 images 目录中未被引用的文件（警告，不阻断）
    img_dir = site_dir / "images"
    if img_dir.exists():
        actual_imgs = {f"images/{f.name}" for f in img_dir.iterdir() if f.is_file()}
        unreferenced = actual_imgs - img_refs
        if unreferenced:
            log(f"  警告: {len(unreferenced)} 张图片未被 HTML 引用", "WARN")
            for u in list(unreferenced)[:3]:
                log(f"    - {u}")

    # 5. 检查路径格式（必须是相对路径）
    abs_refs = [ref for ref in img_refs if ref.startswith("/")]
    if abs_refs:
        issues.append(f"发现绝对路径引用（会导致子目录部署失败）: {abs_refs[0]}")

    # 6. 统计文件
    total_files = sum(1 for _ in site_dir.rglob("*") if _.is_file())
    total_size = sum(f.stat().st_size for f in site_dir.rglob("*") if f.is_file())
    log(f"  总文件: {total_files} 个, 总大小: {total_size / 1024 / 1024:.1f} MB", "OK")

    if issues:
        for issue in issues:
            log(f"  问题: {issue}", "ERR")
        return False, issues

    log("文件完整性检查通过", "OK")
    return True, []

def upload_file(sftp, local_file, remote_file, rel_display):
    """上传单个文件"""
    try:
        sftp.put(str(local_file), remote_file)
        return True, rel_display
    except Exception as e:
        return False, f"{rel_display}: {e}"

def deploy_to_server(site_dir, subdir):
    """部署到服务器"""
    paramiko = ensure_paramiko()
    remote_dir = f"{REMOTE_ROOT}/{subdir}"

    log(f"连接服务器 {HOST}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=PORT, username=USER, password=PASS)
    sftp = ssh.open_sftp()
    log("连接成功", "OK")

    # 创建远程目录
    log(f"创建远程目录: {remote_dir}")
    try:
        sftp.mkdir(remote_dir)
    except IOError:
        pass

    # 收集所有要上传的文件
    files_to_upload = []
    for root, dirs, files in os.walk(site_dir):
        root_path = Path(root)
        rel_path = root_path.relative_to(site_dir)
        if str(rel_path) == ".":
            remote_path = remote_dir
        else:
            remote_path = f"{remote_dir}/{str(rel_path).replace(chr(92), '/')}"
            try:
                sftp.mkdir(remote_path)
            except IOError:
                pass

        for file in files:
            local_file = root_path / file
            remote_file = f"{remote_path}/{file}"
            rel_display = str(rel_path / file).replace(chr(92), '/')
            files_to_upload.append((local_file, remote_file, rel_display))

    # 单线程上传（避免连接不稳定导致失败）
    log(f"开始上传 {len(files_to_upload)} 个文件...")
    success = 0
    failed = []
    for lf, rf, rd in files_to_upload:
        ok, msg = upload_file(sftp, lf, rf, rd)
        if ok:
            success += 1
            print(f"  [+] {msg}")
        else:
            failed.append(msg)
            print(f"  [x] {msg}")

    log(f"上传完成: {success}/{len(files_to_upload)} 成功", "OK" if not failed else "WARN")
    if failed:
        log(f"失败: {len(failed)} 个", "ERR")

    # 验证
    log("验证远程文件...", "CHK")
    stdin, stdout, stderr = ssh.exec_command(f"find {remote_dir} -type f | wc -l")
    remote_count = int(stdout.read().decode().strip())
    log(f"  远程文件数: {remote_count}", "OK")

    sftp.close()
    ssh.close()

    url = f"http://{HOST}/{subdir}/"
    log(f"部署完成: {url}", "OK")
    return url, len(failed) == 0

def main():
    if len(sys.argv) < 3:
        print("用法: python deploy.py <zip文件路径> <子目录名>")
        print("  例如: python deploy.py BTI_v3.2.zip bti")
        sys.exit(1)

    zip_path = Path(sys.argv[1]).resolve()
    subdir = sys.argv[2]

    if not zip_path.exists():
        log(f"文件不存在: {zip_path}", "ERR")
        sys.exit(1)

    # Python 环境检测
    py_cmd, py_exe = get_python_cmd()
    log(f"使用 Python: {py_exe or py_cmd}")

    # 清理并创建临时目录
    temp_dir = TEMP_BASE / subdir
    if temp_dir.exists():
        shutil.rmtree(temp_dir)
    temp_dir.mkdir(parents=True, exist_ok=True)

    try:
        # 解压
        extract_dir = extract_zip(zip_path, temp_dir)

        # 找到网站根目录
        site_dir = find_site_root(extract_dir)
        if not site_dir:
            log("未找到 index.html，请检查压缩包内容", "ERR")
            sys.exit(1)
        log(f"网站根目录: {site_dir}")

        # 完整性检查
        ok, issues = check_integrity(site_dir)
        if not ok:
            log("文件完整性检查未通过，已阻止上传", "ERR")
            for issue in issues:
                log(f"  - {issue}", "ERR")
            sys.exit(1)

        # 部署
        url, success = deploy_to_server(site_dir, subdir)

        if success:
            log(f"全部成功！访问: {url}", "OK")
        else:
            log(f"部分文件上传失败，请检查", "WARN")

    finally:
        # 清理临时目录
        if temp_dir.exists():
            shutil.rmtree(temp_dir)
            log("临时文件已清理")

if __name__ == "__main__":
    main()

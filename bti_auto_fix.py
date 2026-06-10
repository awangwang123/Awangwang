#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BTI 网站一键修复 + 自动部署脚本
功能：
1. 自动连接服务器（从 winscp_script.txt 读取配置）
2. 修复 Nginx 中文乱码（添加 charset utf-8）
3. 可选：同步本地最新文件到服务器
"""

import paramiko
import re
import os
import sys
import time

WINSCP_SCRIPT = r"C:\Users\EDY\CC\BTI\BTI_website\winscp_script.txt"
LOCAL_WEB_DIR = r"C:\Users\EDY\CC\BTI\BTI_website"
REMOTE_WEB_DIR = "/var/www/html/bti"


def print_step(step_num, msg):
    print(f"\n{'='*50}")
    print(f"  步骤 {step_num}: {msg}")
    print(f"{'='*50}")


def get_conn_info():
    """从 winscp_script.txt 解析连接信息"""
    if not os.path.exists(WINSCP_SCRIPT):
        print(f"[!] 找不到 {WINSCP_SCRIPT}")
        return None

    with open(WINSCP_SCRIPT, "r", encoding="utf-8") as f:
        content = f.read()

    # 解析 sftp://root:PASSWORD@IP:22
    match = re.search(r'sftp://([^:]+):([^@]+)@([^:]+):(\d+)', content)
    if not match:
        print("[!] 无法从 winscp_script.txt 解析连接信息")
        return None

    user, password, host, port = match.groups()
    return {
        "hostname": host,
        "port": int(port),
        "username": user,
        "password": password,
    }


def ssh_exec(ssh, cmd, sudo=False):
    """执行远程命令并返回输出"""
    if sudo:
        # 使用 root 直接执行，不需要 sudo
        cmd = cmd
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    return out, err, stdout.channel.recv_exit_status()


def fix_nginx(ssh):
    """修复 Nginx 中文乱码配置"""
    print_step(2, "修复 Nginx 中文乱码配置")

    # 1. 备份 nginx.conf
    backup_cmd = "cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak.$(date +%s) && echo 'BACKUP_OK'"
    out, err, code = ssh_exec(ssh, backup_cmd)
    if "BACKUP_OK" in out:
        print("[+] 已备份 /etc/nginx/nginx.conf")
    else:
        print(f"[!] 备份可能失败: {err}")
        # 继续尝试

    # 2. 检查当前配置中的 charset
    out, err, code = ssh_exec(ssh, "grep -i 'charset' /etc/nginx/nginx.conf || echo 'NOT_FOUND'")
    if "utf-8" in out.lower():
        print("[+] nginx.conf 中已存在 charset utf-8 配置，无需修改")
        return True

    print("[i] 未找到 charset 配置，准备添加...")

    # 3. 查找 http { 块的位置并添加 charset
    # 使用 sed 在 http { 下一行添加 charset utf-8;
    fix_cmd = """
HTTP_LINE=$(grep -n "^http {" /etc/nginx/nginx.conf | head -1 | cut -d: -f1)
if [ -n "$HTTP_LINE" ]; then
    sed -i "${HTTP_LINE}a\\    charset utf-8;" /etc/nginx/nginx.conf
    echo "ADDED_OK"
else
    echo "HTTP_BLOCK_NOT_FOUND"
fi
"""
    out, err, code = ssh_exec(ssh, fix_cmd)
    if "ADDED_OK" in out:
        print("[+] 已在 http 块中添加 charset utf-8;")
    elif "HTTP_BLOCK_NOT_FOUND" in out:
        print("[!] 在 nginx.conf 中找不到 http { 块，尝试其他方式...")
        # 直接在文件开头后添加（兜底）
        fallback_cmd = """
if ! grep -q "charset utf-8" /etc/nginx/nginx.conf; then
    sed -i '1a\\    charset utf-8;' /etc/nginx/nginx.conf
    echo 'FALLBACK_ADDED'
fi
"""
        out, err, code = ssh_exec(ssh, fallback_cmd)
        print(f"[i] 兜底添加结果: {out.strip()}")
    else:
        print(f"[!] 添加配置时出错: {err}")
        return False

    # 4. 测试配置语法
    print("[i] 测试 Nginx 配置语法...")
    out, err, code = ssh_exec(ssh, "nginx -t")
    print(out)
    if err:
        print(err)
    if code != 0:
        print("[!] Nginx 配置测试失败！正在恢复备份...")
        ssh_exec(ssh, "cp /etc/nginx/nginx.conf.bak.* /etc/nginx/nginx.conf 2>/dev/null; nginx -t")
        return False

    # 5. 重载 Nginx
    print("[i] 重载 Nginx...")
    out, err, code = ssh_exec(ssh, "nginx -s reload")
    if code == 0:
        print("[+] Nginx 重载成功！")
    else:
        print(f"[!] Nginx 重载失败: {err}")
        return False

    return True


def sync_files(ssh):
    """同步本地文件到服务器（可选）"""
    print_step(3, "同步网站文件到服务器")

    transport = ssh.get_transport()
    sftp = paramiko.SFTPClient.from_transport(transport)

    files_to_sync = ["index.html", "app.js", "data.js", "styles.css", "manifest.json", "service-worker.js"]
    dirs_to_sync = ["images"]

    synced = 0
    for fname in files_to_sync:
        local_path = os.path.join(LOCAL_WEB_DIR, fname)
        remote_path = f"{REMOTE_WEB_DIR}/{fname}"
        if os.path.exists(local_path):
            print(f"[i] 同步 {fname} ...")
            sftp.put(local_path, remote_path)
            synced += 1
        else:
            print(f"[!] 本地找不到 {fname}，跳过")

    # 同步 images 目录
    local_images = os.path.join(LOCAL_WEB_DIR, "images")
    remote_images = f"{REMOTE_WEB_DIR}/images"
    if os.path.exists(local_images):
        print("[i] 同步 images 目录...")
        # 确保远程目录存在
        ssh_exec(ssh, f"mkdir -p {remote_images}")
        for item in os.listdir(local_images):
            local_item = os.path.join(local_images, item)
            remote_item = f"{remote_images}/{item}"
            if os.path.isfile(local_item):
                sftp.put(local_item, remote_item)
                synced += 1

    sftp.close()
    print(f"[+] 同步完成，共同步 {synced} 个文件/目录")
    return True


def verify_website():
    """验证网站可访问性（简单提示）"""
    print_step(4, "验证")
    print("请在浏览器打开以下地址验证中文是否正常：")
    print("  http://www.wangwangtt.top/bti/")
    print("如果仍显示乱码，请截图发给我。")


def main():
    print("=" * 50)
    print("  BTI 网站一键修复 + 自动部署工具")
    print("=" * 50)

    # 步骤 1: 连接服务器
    print_step(1, "连接服务器")
    conn = get_conn_info()
    if not conn:
        print("[!] 无法获取服务器连接信息，请检查 winscp_script.txt")
        sys.exit(1)

    print(f"[i] 正在连接 {conn['hostname']}:{conn['port']} ...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(**conn, timeout=15)
        print("[+] SSH 连接成功！")
    except Exception as e:
        print(f"[!] 连接失败: {e}")
        sys.exit(1)

    try:
        # 步骤 2: 修复 Nginx
        if not fix_nginx(ssh):
            print("\n[!] Nginx 修复失败，请把上面的日志截图发给我。")
            sys.exit(1)

        # 步骤 3: 询问是否同步文件
        print("\n" + "-" * 50)
        choice = input("是否同步本地最新网站文件到服务器？(y/n): ").strip().lower()
        if choice in ("y", "yes", "是"):
            sync_files(ssh)
        else:
            print("[i] 跳过文件同步")

        # 步骤 4: 验证
        verify_website()

        print("\n" + "=" * 50)
        print("  ✅ 全部完成！")
        print("=" * 50)

    finally:
        ssh.close()

    # 安全提醒
    print("\n[!] 安全提醒：winscp_script.txt 中包含明文密码，")
    print("    建议部署完成后删除或加密该文件。")


if __name__ == "__main__":
    main()

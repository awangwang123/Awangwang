#!/bin/bash
# BTI Nginx 编码修复脚本
# 功能：自动检查并添加 charset utf-8 到 Nginx 配置

set -e

NGINX_CONF="/etc/nginx/nginx.conf"

echo "========================================"
echo "  BTI Nginx 编码修复工具"
echo "========================================"
echo ""

# 检查是否 root 权限
if [ "$EUID" -ne 0 ]; then
    echo "[!] 错误：需要使用 root 权限运行"
    echo "    请执行：sudo bash fix_nginx.sh"
    exit 1
fi

# 检查 Nginx 配置文件是否存在
if [ ! -f "$NGINX_CONF" ]; then
    echo "[!] 错误：找不到 Nginx 配置文件：$NGINX_CONF"
    exit 1
fi

echo "[i] Nginx 配置文件路径：$NGINX_CONF"
echo ""

# 检查是否已有 charset utf-8
if grep -q "charset utf-8" "$NGINX_CONF"; then
    echo "[+] 配置已存在：charset utf-8"
    echo "[i] 无需修改，直接测试配置..."
else
    echo "[i] 未找到 charset 配置，正在添加..."

    # 查找 http { 所在行号
    HTTP_LINE=$(grep -n "^http {" "$NGINX_CONF" | head -1 | cut -d: -f1)

    if [ -z "$HTTP_LINE" ]; then
        echo "[!] 错误：在 $NGINX_CONF 中找不到 'http {' 块"
        exit 1
    fi

    echo "[i] 找到 http 块在第 $HTTP_LINE 行"

    # 在 http { 下一行添加 charset utf-8;
    sed -i "${HTTP_LINE}a\\    charset utf-8;" "$NGINX_CONF"

    echo "[+] 已添加：charset utf-8;"
fi

echo ""
echo "[i] 测试 Nginx 配置语法..."

# 测试配置
if nginx -t; then
    echo ""
    echo "[+] 配置测试通过！"
    echo "[i] 正在重载 Nginx..."
    nginx -s reload
    echo ""
    echo "========================================"
    echo "  ✅ 修复完成！"
    echo "========================================"
    echo ""
    echo "请刷新网页验证："
    echo "  http://www.wangwangtt.top/bti/"
    echo ""
else
    echo ""
    echo "========================================"
    echo "  ❌ Nginx 配置测试失败"
    echo "========================================"
    echo ""
    echo "请把上面的错误信息发给我，我会帮你解决。"
    exit 1
fi

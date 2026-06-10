---
name: website-deploy
description: 将本地网站文件（zip 包）上传到远程服务器部署。当用户说"上线网站""部署网站""传上去""上传网站""发布网站""更新网站"或任何涉及将本地 HTML/CSS/JS 文件部署到服务器时触发。也适用于用户提供了一个 zip 包并要求将其部署到线上、或要求更新已部署的网站版本。
---

# Website Deploy — 网站一键部署

将本地 zip 包解压、验证完整性后上传到阿里云服务器指定子目录。

## 服务器配置（固定）

| 配置项 | 值 |
|--------|-----|
| 服务器 IP | 8.148.82.169 |
| 用户名 | root |
| 密码 | Pb52013145 |
| 端口 | 22 |
| 网站根目录 | /var/www/html |

## 已部署网站

- 拼豆：`/var/www/html/`（根目录）
- BTI：`/var/www/html/bti/`（子目录）

## 核心流程

```
用户提供 zip 文件路径
    → 询问子目录名（如 bti、perler、blog）
    → 调用 scripts/deploy.py 执行部署
    → 浏览器验证
```

## 使用 deploy.py 脚本

脚本路径：`scripts/deploy.py`

用法：
```bash
python scripts/deploy.py <zip文件路径> <子目录名>
```

例如：
```bash
python scripts/deploy.py "C:\Users\EDY\Downloads\BTI_v3.2.zip" bti
```

### 脚本自动完成

1. **Python 环境检测** — 自动找到本地安装的 Python（排除 Windows 商店版）
2. **自动安装 paramiko** — 如未安装则自动 pip install
3. **解压 zip** — 处理 Windows 反斜杠路径问题
4. **文件完整性检查**
   - 检查 index.html 是否存在
   - 检查 HTML 引用的所有资源文件是否实际存在
   - 检查路径是否为相对路径（防止子目录部署后 404）
   - **检查失败则阻止上传**
5. **并发上传** — 4 线程 SFTP 上传到服务器
6. **远程验证** — 统计远程文件数确认上传完整
7. **自动清理** — 删除临时解压目录

## 工作流程

### 首次部署/更新

1. 确认用户提供的 zip 文件路径
2. 询问子目录名（如用户未指定）
   - 每个网站单独一个子目录，避免冲突
3. 检查 zip 文件是否存在
4. 运行 `python scripts/deploy.py <zip> <subdir>`
5. 查看脚本输出，确认上传成功
6. 浏览器打开 `http://8.148.82.169/{subdir}/` 验证
7. 检查控制台是否有图片 404

### 手动部署（脚本不可用时）

仅在脚本无法使用时才手动操作：

1. **本地解压** — 使用 bash unzip，注意 Windows zip 可能用反斜杠路径
2. **检查 index.html** — 确认图片路径是相对路径（`images/xxx.jpg`）
3. **Python + paramiko 上传**
   - 连接 8.148.82.169:22
   - 创建 `/var/www/html/{subdir}/`
   - 上传 index.html 和所有资源文件
4. **验证** — 浏览器打开确认

## 注意事项

- 用户给的 zip 包可能是 Windows 打包的，路径用反斜杠，脚本会自动处理
- 不要直接把 zip 上传到服务器再解压，而是在本地解压后逐个文件上传
- 子目录名只包含字母、数字、连字符，避免中文和空格
- 如果网站有 favicon.ico，可以额外上传一个，避免浏览器 404

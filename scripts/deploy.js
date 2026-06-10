#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * 网站一键部署脚本 — Node.js 版本
 * 用法: node deploy.js <zip文件路径> <子目录名>
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');
const os = require('os');

// ============ 读取配置 ============
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...valParts] = trimmed.split('=');
      const val = valParts.join('=').trim().replace(/^["']|["']$/g, '');
      if (!(key.trim() in process.env)) {
        process.env[key.trim()] = val;
      }
    }
  }
}

loadEnv();

const HOST = process.env.DEPLOY_HOST || '';
const PORT = parseInt(process.env.DEPLOY_PORT || '22', 10);
const USER = process.env.DEPLOY_USER || '';
const PASS = process.env.DEPLOY_PASS || '';
const REMOTE_ROOT = process.env.DEPLOY_REMOTE_ROOT || '/var/www/html';
const TEMP_BASE = path.join(os.tmpdir(), 'bti_deploy_temp');
// =============================

function log(msg, level = 'INFO') {
  const prefix = { INFO: '[i]', OK: '[+]', WARN: '[!]', ERR: '[x]', CHK: '[*]' };
  console.log(`${prefix[level] || '[?]'} ${msg}`);
}

function validateConfig() {
  const missing = [];
  if (!HOST) missing.push('DEPLOY_HOST');
  if (!USER) missing.push('DEPLOY_USER');
  if (!PASS) missing.push('DEPLOY_PASS');
  if (missing.length > 0) {
    console.error(`[x] 缺少必填配置项: ${missing.join(', ')}`);
    console.error('[i] 请在 .env 文件中设置这些变量');
    process.exit(1);
  }
}


function findSiteRoot(extractDir) {
  const candidates = [];
  function walk(dir, depth) {
    const files = fs.readdirSync(dir);
    if (files.includes('index.html')) {
      candidates.push({ depth, dir });
    }
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory() && !file.startsWith('.')) {
        walk(fullPath, depth + 1);
      }
    }
  }
  walk(extractDir, 0);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.depth - b.depth);
  return candidates[0].dir;
}

function checkIntegrity(siteDir) {
  log('开始文件完整性检查...', 'CHK');
  const issues = [];

  const indexHtml = path.join(siteDir, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    issues.push('缺少 index.html（主入口文件）');
    return { ok: false, issues };
  }
  log('  index.html 存在', 'OK');

  let content;
  try {
    content = fs.readFileSync(indexHtml, 'utf8');
  } catch (e) {
    issues.push(`无法读取 index.html: ${e.message}`);
    return { ok: false, issues };
  }

  // 检查图片引用
  const imgRefs = new Set();
  const matches = content.match(/["'](images\/[^"']+)["']/g);
  if (matches) {
    for (const m of matches) {
      const ref = m.replace(/["']/g, '');
      imgRefs.add(ref);
    }
  }
  log(`  HTML 引用图片: ${imgRefs.size} 个`);

  const missingImgs = [];
  for (const ref of imgRefs) {
    const imgPath = path.join(siteDir, ref.replace(/\//g, path.sep));
    if (!fs.existsSync(imgPath)) {
      missingImgs.push(ref);
    }
  }

  if (missingImgs.length > 0) {
    issues.push(`HTML 引用了 ${missingImgs.length} 个不存在的图片: ${missingImgs.slice(0, 5).join(', ')}`);
  }

  // 检查未被引用的图片
  const imgDir = path.join(siteDir, 'images');
  if (fs.existsSync(imgDir)) {
    const actualImgs = new Set();
    for (const f of fs.readdirSync(imgDir)) {
      if (fs.statSync(path.join(imgDir, f)).isFile()) {
        actualImgs.add(`images/${f}`);
      }
    }
    const unreferenced = [...actualImgs].filter(x => !imgRefs.has(x));
    if (unreferenced.length > 0) {
      log(`  警告: ${unreferenced.length} 张图片未被 HTML 引用`, 'WARN');
      for (const u of unreferenced.slice(0, 3)) {
        log(`    - ${u}`);
      }
    }
  }

  // 检查绝对路径引用
  const absRefs = [...imgRefs].filter(ref => ref.startsWith('/'));
  if (absRefs.length > 0) {
    issues.push(`发现绝对路径引用: ${absRefs[0]}`);
  }

  // 统计文件
  let totalFiles = 0;
  let totalSize = 0;
  function countFiles(dir) {
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      const stat = fs.statSync(fp);
      if (stat.isDirectory()) {
        countFiles(fp);
      } else {
        totalFiles++;
        totalSize += stat.size;
      }
    }
  }
  countFiles(siteDir);
  log(`  总文件: ${totalFiles} 个, 总大小: ${(totalSize / 1024 / 1024).toFixed(1)} MB`, 'OK');

  if (issues.length > 0) {
    for (const issue of issues) {
      log(`  问题: ${issue}`, 'ERR');
    }
    return { ok: false, issues };
  }

  log('文件完整性检查通过', 'OK');
  return { ok: true, issues: [] };
}

async function deployToServer(siteDir, subdir) {
  const remoteDir = `${REMOTE_ROOT}/${subdir}`;

  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on('ready', () => {
      log(`连接服务器 ${HOST}...`, 'OK');
      conn.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }

        // 收集所有要上传的文件
        const filesToUpload = [];
        function collectFiles(dir, relPath) {
          for (const f of fs.readdirSync(dir)) {
            const fp = path.join(dir, f);
            const stat = fs.statSync(fp);
            const remoteRel = relPath ? `${relPath}/${f}` : f;
            if (stat.isDirectory()) {
              collectFiles(fp, remoteRel);
            } else {
              filesToUpload.push({ local: fp, remote: `${remoteDir}/${remoteRel}`, display: remoteRel });
            }
          }
        }
        collectFiles(siteDir, '');

        // 创建远程目录结构
        const remoteDirs = new Set();
        remoteDirs.add(remoteDir);
        for (const { remote } of filesToUpload) {
          const dir = path.dirname(remote).replace(/\\/g, '/');
          remoteDirs.add(dir);
        }

        // 按深度排序创建目录
        const sortedDirs = [...remoteDirs].sort((a, b) => a.split('/').length - b.split('/').length);

        function createDirs(dirIndex, callback) {
          if (dirIndex >= sortedDirs.length) {
            callback();
            return;
          }
          sftp.mkdir(sortedDirs[dirIndex], (err) => {
            // 忽略已存在的目录错误
            createDirs(dirIndex + 1, callback);
          });
        }

        createDirs(0, () => {
          log(`开始上传 ${filesToUpload.length} 个文件...`);
          let success = 0;
          let failed = [];
          let uploaded = 0;

          for (const { local, remote, display } of filesToUpload) {
            sftp.fastPut(local, remote, (err) => {
              uploaded++;
              if (err) {
                failed.push(`${display}: ${err.message}`);
                console.log(`  [x] ${display}: ${err.message}`);
              } else {
                success++;
                console.log(`  [+] ${display}`);
              }

              if (uploaded === filesToUpload.length) {
                log(`上传完成: ${success}/${filesToUpload.length} 成功`, failed.length === 0 ? 'OK' : 'WARN');
                if (failed.length > 0) {
                  log(`失败: ${failed.length} 个`, 'ERR');
                }

                // 验证
                log('验证远程文件...', 'CHK');
                conn.exec(`find ${remoteDir} -type f | wc -l`, (err, stream) => {
                  if (err) {
                    sftp.end();
                    conn.end();
                    reject(err);
                    return;
                  }
                  let output = '';
                  stream.on('data', (data) => { output += data; });
                  stream.on('close', () => {
                    const remoteCount = parseInt(output.trim(), 10);
                    log(`  远程文件数: ${remoteCount}`, 'OK');
                    sftp.end();
                    conn.end();
                    const url = `http://${HOST}/${subdir}/`;
                    log(`部署完成: ${url}`, 'OK');
                    resolve({ url, success: failed.length === 0 });
                  });
                });
              }
            });
          }
        });
      });
    });

    conn.on('error', (err) => {
      reject(err);
    });

    conn.connect({
      host: HOST,
      port: PORT,
      username: USER,
      password: PASS,
      readyTimeout: 30000,
    });
  });
}

async function main() {
  if (process.argv.length < 4) {
    console.log('用法: node deploy.js <zip文件路径> <子目录名>');
    console.log('  例如: node deploy.js ../BTI_v3.4.zip bti');
    process.exit(1);
  }

  const zipPath = path.resolve(process.argv[2]);
  const subdir = process.argv[3];

  if (!fs.existsSync(zipPath)) {
    log(`文件不存在: ${zipPath}`, 'ERR');
    process.exit(1);
  }

  validateConfig();
  log(`使用服务器: ${HOST}`);

  // 清理并创建临时目录
  const tempDir = path.join(TEMP_BASE, subdir);
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // 解压
    // 使用系统 tar 命令解压（Node.js 内置不支持 zip）
    const { execSync } = require('child_process');
    log(`解压: ${zipPath}`);
    // PowerShell Expand-Archive
    const psCmd = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tempDir}' -Force"`;
    execSync(psCmd, { stdio: 'ignore' });

    // 找到网站根目录
    const siteDir = findSiteRoot(tempDir);
    if (!siteDir) {
      log('未找到 index.html，请检查压缩包内容', 'ERR');
      process.exit(1);
    }
    log(`网站根目录: ${siteDir}`);

    // 完整性检查
    const { ok, issues } = checkIntegrity(siteDir);
    if (!ok) {
      log('文件完整性检查未通过，已阻止上传', 'ERR');
      for (const issue of issues) {
        log(`  - ${issue}`, 'ERR');
      }
      process.exit(1);
    }

    // 部署
    const { url, success } = await deployToServer(siteDir, subdir);

    if (success) {
      log(`全部成功！访问: ${url}`, 'OK');
    } else {
      log('部分文件上传失败，请检查', 'WARN');
    }

  } finally {
    // 清理临时目录
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
      log('临时文件已清理');
    }
  }
}

main().catch(err => {
  log(`部署失败: ${err.message}`, 'ERR');
  console.error(err.stack);
  process.exit(1);
});

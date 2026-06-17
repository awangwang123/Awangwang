/**
 * BTI 项目构建脚本
 * 功能：压缩 CSS/JS、清除缓存、生成部署包
 * 用法：node build.js [版本号]
 *   例如：node build.js v3.4
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = '.';
const DIST_DIR = './dist';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function minifyCSS(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/;\s*}/g, '}')
    .replace(/\s*([{}:;,])\s*/g, '$1')
    .trim();
}

function minifyJS(js) {
  // 安全压缩策略：只移除空白和多行注释，绝对不动单行注释
  // 原因：无法安全区分 "// 注释" 和 "http://"、"file:///" 等 URL
  return js
    .replace(/\/\*[\s\S]*?\*\//g, '')    // 只移除多行注释（安全）
    .replace(/^[\t ]+/gm, '')             // 移除行首缩进
    .replace(/[\t ]+$/gm, '')             // 移除行尾空白
    .replace(/\n{3,}/g, '\n\n')           // 最多保留一个空行
    .trim();
}

function copyDir(src, dst) {
  ensureDir(dst);
  fs.readdirSync(src).forEach(file => {
    if (file === 'dist' || file === 'versions' || file === '.claude' || file.endsWith('.log')) return;
    const srcPath = path.join(src, file);
    const dstPath = path.join(dst, file);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyDir(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  });
}

function build() {
  const version = process.argv[2] || 'latest';
  const timestamp = Date.now();

  console.log('[i] BTI 构建开始，版本：' + version);

  // 清理并创建 dist 目录
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true });
  }
  ensureDir(DIST_DIR);

  // 压缩 CSS
  const css = fs.readFileSync(path.join(SRC_DIR, 'styles.css'), 'utf8');
  const minCss = minifyCSS(css);
  fs.writeFileSync(path.join(DIST_DIR, 'styles.css'), minCss);
  console.log('[+] CSS 压缩完成：' + css.length + ' -> ' + minCss.length + ' bytes');

  // 压缩 data.js
  const data = fs.readFileSync(path.join(SRC_DIR, 'data.js'), 'utf8');
  const minData = minifyJS(data);
  fs.writeFileSync(path.join(DIST_DIR, 'data.js'), minData);
  console.log('[+] data.js 压缩完成：' + data.length + ' -> ' + minData.length + ' bytes');

  // 压缩 app.js
  const app = fs.readFileSync(path.join(SRC_DIR, 'app.js'), 'utf8');
  const minApp = minifyJS(app);
  fs.writeFileSync(path.join(DIST_DIR, 'app.js'), minApp);
  console.log('[+] app.js 压缩完成：' + app.length + ' -> ' + minApp.length + ' bytes');

  // 复制图片
  copyDir(path.join(SRC_DIR, 'images'), path.join(DIST_DIR, 'images'));
  console.log('[+] 图片资源已复制');

  // 处理 index.html：添加缓存清除时间戳
  let html = fs.readFileSync(path.join(SRC_DIR, 'index.html'), 'utf8');
  html = html.replace(/styles\.css/g, 'styles.css?v=' + timestamp);
  html = html.replace(/data\.js/g, 'data.js?v=' + timestamp);
  html = html.replace(/app\.js/g, 'app.js?v=' + timestamp);
  // 更新版本号（支持 v3.6 / v3.10.3 / v3.10.10.10 任意段数）
  html = html.replace(/(<title>.*?BTI 反差人格测试 )v[0-9]+(?:\.[0-9]+)*/, '$1' + version);
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html);
  console.log('[+] index.html 已更新（缓存清除时间戳：' + timestamp + '）');

  // 复制新增页面
  const extraPages = ['types.html', 'about.html', 'privacy.html', 'articles.html', 'changelog.html', 'help.html', 'article-1.html', 'article-2.html', 'article-3.html', 'article-4.html'];
  extraPages.forEach(page => {
    const srcPath = path.join(SRC_DIR, page);
    const dstPath = path.join(DIST_DIR, page);
    if (fs.existsSync(srcPath)) {
      let pageHtml = fs.readFileSync(srcPath, 'utf8');
      // 为这些页面引用的 styles.css 也添加版本戳
      pageHtml = pageHtml.replace(/styles\.css/g, 'styles.css?v=' + timestamp);
      // title 版本号统一处理（支持任意段数版本号）
      pageHtml = pageHtml.replace(/(<title>.*?BTI.*? )v[0-9]+(?:\.[0-9]+)*/, '$1' + version);
      fs.writeFileSync(dstPath, pageHtml);
      console.log('[+] ' + page + ' 已复制到 dist');
    } else {
      console.log('[!] 未找到 ' + page + '，已跳过');
    }
  });

  // 统计
  const htmlSize = fs.statSync(path.join(DIST_DIR, 'index.html')).size;
  const cssSize = fs.statSync(path.join(DIST_DIR, 'styles.css')).size;
  const dataSize = fs.statSync(path.join(DIST_DIR, 'data.js')).size;
  const appSize = fs.statSync(path.join(DIST_DIR, 'app.js')).size;

  console.log('');
  console.log('[+] 构建完成！输出目录：' + DIST_DIR);
  console.log('    index.html: ' + htmlSize + ' bytes');
  console.log('    styles.css: ' + cssSize + ' bytes');
  console.log('    data.js: ' + dataSize + ' bytes');
  console.log('    app.js: ' + appSize + ' bytes');
  console.log('');
  console.log('[i] 下一步：cd dist && python ../pack.py');
}

build();

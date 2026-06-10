const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const baseDir = process.argv[2] || '.';
const version = process.argv[3] || 'latest';
const zipPath = path.join('..', 'BTI_' + version + '.zip');

const zip = new AdmZip();

function addDir(dirPath, zipRoot) {
  const items = fs.readdirSync(dirPath);
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    const relPath = path.join(zipRoot, item);

    if (stat.isDirectory()) {
      if (['.claude', 'dist', 'versions', '__pycache__', 'node_modules'].includes(item)) continue;
      addDir(fullPath, relPath);
    } else {
      if (item.endsWith('.log') || item.endsWith('.py')) continue;
      zip.addLocalFile(fullPath, zipRoot);
      console.log('  + ' + relPath.replace(/\\/g, '/'));
    }
  }
}

addDir(baseDir, '');
zip.writeZip(zipPath);

const size = fs.statSync(zipPath).size;
console.log('');
console.log('[+] 打包完成: ' + zipPath);
console.log('    文件大小: ' + (size / 1024 / 1024).toFixed(1) + ' MB (' + size.toLocaleString() + ' bytes)');

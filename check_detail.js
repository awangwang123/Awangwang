const fs = require('fs');
const html = fs.readFileSync('C:/Users/EDY/CC/BTI/BTI_website/types.html', 'utf8');

const match = html.match(/const DETAIL_CONTENT = \{([\s\S]+?)\n\};/);
const block = match[1];

// 提取每个条目 - 先找key，再找该条目内的字段
const entries = [];
const keyRe = /'([A-Z_]+)':\s*\{/g;
const keys = [];
let m;
while ((m = keyRe.exec(block)) !== null) keys.push(m[1]);

for (const key of keys) {
  const startIdx = block.indexOf("'" + key + "': {");
  let endIdx = startIdx + key.length + 4;
  let braceCount = 1;
  while (braceCount > 0 && endIdx < block.length) {
    if (block[endIdx] === '{') braceCount++;
    if (block[endIdx] === '}') braceCount--;
    endIdx++;
  }
  const entryBlock = block.substring(startIdx, endIdx);

  const extract = (field) => {
    const re = new RegExp(field + ": '((?:[^'\\\\]|\\\\.)*)'");
    const match = entryBlock.match(re);
    return match ? match[1] : '';
  };

  entries.push({
    key,
    main: extract('main'),
    hidden: extract('hidden'),
    scene: extract('scene'),
    tip: extract('tip')
  });
}

console.log('=== types.html DETAIL_CONTENT 检查 ===');
console.log('共 ' + entries.length + ' 种人格');

function similarity(a, b) {
  if (a === b) return 1;
  const wa = a.replace(/[，。！？、：；"'']/g, ' ').split(/\s+/).filter(w => w.length >= 2);
  const wb = b.replace(/[，。！？、：；"'']/g, ' ').split(/\s+/).filter(w => w.length >= 2);
  if (wa.length === 0 || wb.length === 0) return 0;
  const setA = new Set(wa);
  const setB = new Set(wb);
  let common = 0;
  for (const w of setA) if (setB.has(w)) common++;
  return common / Math.max(setA.size, setB.size);
}

const fields = ['main', 'hidden', 'scene', 'tip'];

// 检查重复
fields.forEach(field => {
  const values = {};
  let dupFound = false;
  entries.forEach(e => {
    const v = e[field];
    if (values[v]) {
      if (!dupFound) {
        console.log('\n--- ' + field + ' 重复 ---');
        dupFound = true;
      }
      console.log('⚠️ [' + e.key + '] 与 [' + values[v].key + '] 完全相同');
    } else {
      values[v] = e;
    }
  });
});

// 检查相似
console.log('\n=== 检查相似文案（阈值 0.45） ===');
fields.forEach(field => {
  let found = false;
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i][field];
      const b = entries[j][field];
      if (a.length < 20 || b.length < 20) continue;
      const sim = similarity(a, b);
      if (sim >= 0.45) {
        if (!found) {
          console.log('\n--- ' + field + ' ---');
          found = true;
        }
        console.log('\n🔸 [' + entries[i].key + '] vs [' + entries[j].key + '] 相似度:' + sim.toFixed(2));
        console.log('  A: ' + a.substring(0, 70) + '...');
        console.log('  B: ' + b.substring(0, 70) + '...');
      }
    }
  }
});

// 检查 main vs hidden 自相似
console.log('\n=== 检查 main 与 hidden 自相重复 ===');
for (const e of entries) {
  if (e.main.length < 20 || e.hidden.length < 20) continue;
  const sim = similarity(e.main, e.hidden);
  if (sim >= 0.4) {
    console.log('🔸 [' + e.key + '] main 和 hidden 相似度:' + sim.toFixed(2));
  }
}

// 高频词
console.log('\n=== 高频词检查 ===');
function countWords(texts, minLen) {
  const counts = {};
  texts.forEach(t => {
    t.replace(/[，。！？、：；"'']/g, ' ').split(/\s+/).filter(w => w.length >= minLen).forEach(w => {
      counts[w] = (counts[w] || 0) + 1;
    });
  });
  return counts;
}
const sceneWords = countWords(entries.map(e => e.scene), 2);
const tipWords = countWords(entries.map(e => e.tip), 2);
console.log('\n高频 scene 词（≥10次）:');
Object.entries(sceneWords).filter(([w,c]) => c >= 10).sort((a,b) => b[1]-a[1]).slice(0,20).forEach(([w,c]) => console.log('  ' + w + ': ' + c + '次'));
console.log('\n高频 tip 词（≥10次）:');
Object.entries(tipWords).filter(([w,c]) => c >= 10).sort((a,b) => b[1]-a[1]).slice(0,20).forEach(([w,c]) => console.log('  ' + w + ': ' + c + '次'));

console.log('\n=== 检查完成 ===');

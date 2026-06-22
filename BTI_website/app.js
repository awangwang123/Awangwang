// ============ 全局错误监控 ============
(function setupErrorTracking() {
  window.BTI_ERRORS = window.BTI_ERRORS || [];

  window.onerror = function(msg, url, line, col, err) {
    window.BTI_ERRORS.push({
      type: 'js-error',
      message: msg,
      url: url,
      line: line,
      col: col,
      stack: err ? err.stack : null,
      time: new Date().toISOString()
    });
    console.error('[BTI] 捕获到错误:', msg, 'at', url + ':' + line);
    return false; // 不阻止默认错误处理
  };

  window.onunhandledrejection = function(event) {
    window.BTI_ERRORS.push({
      type: 'promise-rejection',
      message: event.reason && event.reason.message ? event.reason.message : String(event.reason),
      stack: event.reason && event.reason.stack ? event.reason.stack : null,
      time: new Date().toISOString()
    });
    console.error('[BTI] 捕获到未处理的Promise拒绝:', event.reason);
  };

  // html2canvas 专用错误包装器
  window.safeHtml2canvas = function(element, options) {
    if (typeof html2canvas !== 'function') {
      return Promise.reject(new Error('html2canvas 未加载'));
    }
    return html2canvas(element, options).catch(function(err) {
      window.BTI_ERRORS.push({
        type: 'html2canvas-error',
        message: err.message || String(err),
        time: new Date().toISOString()
      });
      throw err; // 继续抛出让调用方处理
    });
  };
})();
// ======================================

let currentQ = 0;
let userChoices = [];
let resultTypeData = null;

function startQuiz() {
  document.getElementById('home').style.display = 'none';
  document.getElementById('quiz').style.display = 'block';
  currentQ = 0;
  userChoices = [];
  window.hasUnlockedHidden = false;
  window.triggeredHidden = null;
  window.hiddenMaxDim = null;
  window.hiddenQ17Options = null;
  window.hiddenQ17Correct = false;
  // 开始新测试时清除旧结果，避免返回/刷新时恢复旧结果
  try {
    ['bti_result_code','bti_result_scores','bti_result_choices','bti_has_hidden_question','bti_has_unlocked_hidden','bti_hidden_key'].forEach(function(k){
      sessionStorage.removeItem(k);
      localStorage.removeItem(k);
    });
  } catch(e) {}
  showQuestion();
}

function showQuestion() {
  const q = QUESTIONS[currentQ];
  const isHiddenQ = (currentQ === 16);
  const totalDisplay = isHiddenQ ? 17 : 16;
  const progress = isHiddenQ ? 100 : (currentQ / 16) * 100;
  document.getElementById('progressFill').style.width = progress + '%';
  
  let html = '';
  if (isHiddenQ) {
    html += '<div class="q-num" style="color:#ffd700;font-weight:800;">隐藏题 · 最终试炼</div>';
    html += '<div style="text-align:center;color:rgba(255,215,0,.6);font-size:13px;margin-bottom:12px;">你的测试结果藏了点什么...</div>';
  } else {
    html += '<div class="q-num">第 ' + (currentQ+1) + '/' + totalDisplay + ' 题</div>';
  }
  html += '<div class="q-text">' + q.q + '</div>';
  html += '<div class="options">';
  
  if (isHiddenQ) {
    // C1方案：Q17动态2选1（正确选项对应最高分维度对，干扰项来自其他维度对）
    var maxDim = window.hiddenMaxDim || 'H';
    var pairMap = {H:'HC', C:'HC', F:'FS', S:'FS', L:'LQ', Q:'LQ', X:'XD', D:'XD'};
    var correctPair = pairMap[maxDim];
    var pairToIdx = {'HC':0, 'FS':1, 'LQ':2, 'XD':3};
    var correctIdx = pairToIdx[correctPair];
    var wrongIdxs = [0,1,2,3].filter(function(i){ return i !== correctIdx; });
    var wrongIdx = wrongIdxs[Math.floor(Math.random() * wrongIdxs.length)];
    var opts = [
      {origIdx: correctIdx, isCorrect: true, data: q.options[correctIdx]},
      {origIdx: wrongIdx, isCorrect: false, data: q.options[wrongIdx]}
    ];
    // 随机排序
    for (var i = 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = opts[i]; opts[i] = opts[j]; opts[j] = tmp;
    }
    window.hiddenQ17Options = opts;
    var letters = ['A','B'];
    for (var di = 0; di < 2; di++) {
      var opt = opts[di];
      html += '<div class="option" onclick="selectOption(' + di + ')">';
      html += '<span class="opt-letter">' + letters[di] + '</span>';
      html += '<span>' + opt.data.text + '</span>';
      html += '</div>';
    }
  } else {
    const letters = ['A','B','C','D'];
    var idxArr = [0,1,2,3];
    for (var i = 3; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = idxArr[i]; idxArr[i] = idxArr[j]; idxArr[j] = tmp;
    }
    for (var di = 0; di < 4; di++) {
      var origIdx = idxArr[di];
      html += '<div class="option" onclick="selectOption('+origIdx+')">';
      html += '<span class="opt-letter">'+letters[di]+'</span>';
      html += '<span>'+q.options[origIdx].text+'</span>';
      html += '</div>';
    }
  }
  html += '</div>';
  document.getElementById('quizContent').innerHTML = html;
}

function selectOption(origIdx) {
  userChoices.push(origIdx);
  
  // C1方案：隐藏题记录选择是否正确
  if (currentQ === 16 && window.hiddenQ17Options) {
    window.hiddenQ17Correct = window.hiddenQ17Options[origIdx].isCorrect;
  }
  
  var scores = {H:0,C:0,F:0,S:0,L:0,Q:0,X:0,D:0};
  for (var ci = 0; ci < userChoices.length; ci++) {
    var co;
    if (ci === 16 && window.hiddenQ17Options) {
      co = window.hiddenQ17Options[userChoices[ci]].data;
    } else {
      co = QUESTIONS[ci].options[userChoices[ci]];
    }
    for (var sk in co.score) { scores[sk] += co.score[sk]; }
  }
  
  currentQ++;
  
  // 答完Q16（索引15）后，判断是否显示隐藏题Q17（索引16）
  if (currentQ === 16) {
    // C1方案：维度对差值≥5.0分出现隐藏题（出现率约39%，总触发率约19.5%）
    var diffs = [
      Math.abs(scores.H - scores.C),
      Math.abs(scores.F - scores.S),
      Math.abs(scores.L - scores.Q),
      Math.abs(scores.X - scores.D)
    ];
    var maxDiff = Math.max.apply(Math, diffs);
    
    // 记录最高分维度（用于Q17动态生成和触发判断）
    var singleScores = {H:scores.H, C:scores.C, F:scores.F, S:scores.S, L:scores.L, Q:scores.Q, X:scores.X, D:scores.D};
    var maxDim = ''; var maxDimScore = -1;
    for (var sk in singleScores) {
      if (singleScores[sk] > maxDimScore) { maxDimScore = singleScores[sk]; maxDim = sk; }
    }
    window.hiddenMaxDim = maxDim;
    window.hiddenQ17Options = null;
    window.hiddenQ17Correct = false;
    
    if (maxDiff >= 5.0) {
      showQuestion();
      return;
    } else {
      showResult(scores);
      return;
    }
  }
  
  if (currentQ >= QUESTIONS.length) {
    // 显示结果加载动效
    document.getElementById('quiz').style.display = 'none';
    document.getElementById('resultLoading').style.display = 'flex';
    // 1.2秒后显示真实结果
    setTimeout(() => {
      showResult(scores);
      document.getElementById('resultLoading').style.display = 'none';
    }, 1200);
  } else {
    showQuestion();
  }
}

function renderDimBars(scores, finalType) {
  const dims = [
    { icon:'🔥', label:'能量', hot:'H', cold:'C', hotName:'热烈', coldName:'冷静' },
    { icon:'⚡', label:'决策', hot:'F', cold:'S', hotName:'快速', coldName:'缓慢' },
    { icon:'🎤', label:'社交', hot:'L', cold:'Q', hotName:'外放', coldName:'内敛' },
    { icon:'🛡️', label:'应对', hot:'X', cold:'D', hotName:'爆发', coldName:'防御' }
  ];
  const total = scores.H + scores.C + scores.F + scores.S + scores.L + scores.Q + scores.X + scores.D || 1;
  
  // 人格代码总解码
  let codeHtml = '';
  if (finalType && finalType.length === 4) {
    codeHtml += '<div class="personality-code-module" style="text-align:center;margin-bottom:18px;padding:12px 16px;background:rgba(167,139,250,.08);border-radius:12px;border:1px solid rgba(167,139,250,.15);">';
    codeHtml += '<div class="pcm-title" style="font-size:13px;margin-bottom:6px;">你的人格代码由以下四个维度拼成</div>';
    codeHtml += '<div class="pcm-code" style="font-size:18px;font-weight:700;letter-spacing:2px;">';
    for (let i = 0; i < 4; i++) {
      const d = dims[i];
      const tc = finalType[i] || '';
      const isHot = tc === d.hot;
      const color = isHot ? '#ff6b6b' : '#48dbfb';
      codeHtml += '<span style="color:'+color+'">'+tc+'</span>';
      if (i < 3) codeHtml += '<span class="pcm-dot" style="margin:0 4px;">·</span>';
    }
    codeHtml += '</div>';
    codeHtml += '<div class="pcm-dims" style="font-size:12px;margin-top:6px;display:flex;justify-content:center;gap:12px;flex-wrap:wrap;">';
    for (let i = 0; i < 4; i++) {
      const d = dims[i];
      const tc = finalType[i] || '';
      const isHot = tc === d.hot;
      const name = isHot ? d.hotName : d.coldName;
      codeHtml += '<span>'+d.icon+d.label+'('+name+')</span>';
    }
    codeHtml += '</div>';
    codeHtml += '</div>';
  }

  let html = codeHtml;
  const dimKeys = ['H','C','F','S','L','Q','X','D'];
  for (let i = 0; i < dims.length; i++) {
    const d = dims[i];
    const h = scores[d.hot] || 0, c = scores[d.cold] || 0;
    const sum = h + c;
    const hp = sum ? Math.round(h / sum * 100) : 50;
    const cp = 100 - hp;
    const isTie = hp === cp;

    // 用finalType决定哪个字母高亮（你的实际人格字母）
    let hotCls = '', coldCls = '';
    if (finalType) {
      // finalType第i位：0→H/C, 1→F/S, 2→L/Q, 3→X/D
      const typeChar = finalType[i] || '';
      if (typeChar === d.hot) hotCls = ' dim-tilt-hot';   // 你的字母在热侧→热侧红
      else if (typeChar === d.cold) coldCls = ' dim-tilt-cold'; // 你的字母在冷侧→冷侧蓝
    }

    html += '<div class="dim-row">';
    html += '<span class="dim-icon">'+d.icon+'</span>';
    html += '<span class="dim-label">'+d.label+'</span>';
    html += '<span style="font-size:11px;color:rgba(255,107,107,.9);margin-right:4px;">'+d.hotName+'</span>';
    html += '<span class="dim-letter'+hotCls+'"><b>'+d.hot+'</b></span>';
    html += '<div class="dim-bar-wrap">';
    if (hp > 0) html += '<div class="bar-hot" style="width:'+hp+'%"></div>';
    if (cp > 0 && hp < 100) html += '<div class="bar-cold" style="width:'+cp+'%"></div>';
    html += '</div>';
    html += '<span class="dim-letter'+coldCls+'"><b>'+d.cold+'</b></span>';
    html += '<span style="font-size:11px;color:rgba(72,219,251,.9);margin-left:4px;">'+d.coldName+'</span>';
    html += '</div>';
  }
  
  document.getElementById('dimBreakdown').innerHTML = html;
}

function showResult(scores, isRestoring) {
  // isRestoring=true 表示从图鉴页返回恢复结果，不重置解锁/触发状态
  isRestoring = !!isRestoring;

  // C1方案：主人格判断排除Q17加分影响（Q17只影响隐藏人格，不影响主人格）
  var mainScores = {H:scores.H, C:scores.C, F:scores.F, S:scores.S, L:scores.L, Q:scores.Q, X:scores.X, D:scores.D};
  if (userChoices.length >= 17 && window.hiddenQ17Options) {
    var q17Data = window.hiddenQ17Options[userChoices[16]].data;
    for (var sk in q17Data.score) { mainScores[sk] -= q17Data.score[sk]; }
  }

  var typeStr = '';
  typeStr += (mainScores.H >= mainScores.C ? 'H' : 'C');
  typeStr += (mainScores.F >= mainScores.S ? 'F' : 'S');
  typeStr += (mainScores.L >= mainScores.Q ? 'L' : 'Q');
  typeStr += (mainScores.X >= mainScores.D ? 'X' : 'D');

  var finalType = typeStr;
  // 恢复模式下保留已恢复的 triggeredHidden，避免从图鉴返回后被清空
  window.triggeredHidden = isRestoring ? (window.triggeredHidden || null) : null;

  // C1方案：隐藏人格触发检测（Q17选对即触发，选错不触发）
  // 出现条件：维度对差值≥5.0分；触发条件：Q17 2选1选对
  // 恢复模式下不重算，直接沿用 sessionStorage 恢复的状态
  if (!isRestoring && userChoices.length >= 17 && window.hiddenQ17Correct === true) {
    var maxDim = window.hiddenMaxDim;
    var hiddenKey = '';
    if (maxDim === 'H') hiddenKey = 'HIDDEN_HC_HOT';
    else if (maxDim === 'C') hiddenKey = 'HIDDEN_HC_COLD';
    else if (maxDim === 'F') hiddenKey = 'HIDDEN_FS_FAST';
    else if (maxDim === 'S') hiddenKey = 'HIDDEN_FS_SLOW';
    else if (maxDim === 'L') hiddenKey = 'HIDDEN_LQ_LOUD';
    else if (maxDim === 'Q') hiddenKey = 'HIDDEN_LQ_QUIET';
    else if (maxDim === 'X') hiddenKey = 'HIDDEN_XD_EXPLODE';
    else if (maxDim === 'D') hiddenKey = 'HIDDEN_XD_DEFEND';
    window.triggeredHidden = TYPES[hiddenKey];
    if(window.triggeredHidden) window.triggeredHidden.key = hiddenKey;
  }

  window.finalType = finalType;
  window.hasHiddenQuestion = userChoices.length >= 17; // 是否出现了隐藏题（用于分享卡片悬念控制）
  // 恢复模式下保留已恢复的解锁状态，避免从图鉴返回后解锁按钮重新出现
  window.hasUnlockedHidden = isRestoring ? window.hasUnlockedHidden : false;
  var t = TYPES[finalType] || TYPES[typeStr];
  if(!t) {
    t = {name:'未知人格',code:typeStr || '????',rarity:'',img:'',slogan:'',desc:'人格数据加载失败，请刷新页面重试。',roast:'',heal:'',tags:['#未知']};
  }
  resultTypeData = t;

  // 渲染四维反差拆解条（隐藏人格用finalType故意让字母不变色，和常规人格视觉区分）
  renderDimBars(scores, finalType);

  document.getElementById('quiz').style.display = 'none';
  document.getElementById('result').style.display = 'block';
  
  // 翻转卡片 - 正面（主人格）
  var flipFrontImg = document.getElementById('flipFrontImg');
  var flipFrontPlaceholder = document.getElementById('flipFrontPlaceholder');
  var flipFrontName = document.getElementById('flipFrontName');
  var flipCardInner = document.getElementById('flipCardInner');
  var flipCardBack = document.getElementById('flipCardBack');
  var flipBackContent = document.getElementById('flipBackContent');
  
  // 重置翻转
  if(flipCardInner) flipCardInner.classList.remove('flipped');
  
  // 处理图片路径：Windows绝对路径添加file:///前缀；相对路径转为绝对路径，避免部分浏览器/微信解析异常
  function fixImgPath(p){
    if(!p) return p;
    p = p.replace(/\\/g,'/');
    if(/^\w:\//.test(p) && !p.startsWith('file:///')){
      p = 'file:///' + p;
    }
    // 相对路径转为绝对路径
    if(p && !p.startsWith('http') && !p.startsWith('file:///') && !p.startsWith('/')){
      var base = window.location.href.split('?')[0].split('#')[0];
      if(!base.endsWith('/')) base = base.substring(0, base.lastIndexOf('/') + 1);
      p = base + p;
    }
    return p;
  }
  var frontImgPath = fixImgPath(t.img);
  if(frontImgPath){
    flipFrontImg.src = frontImgPath;
    flipFrontImg.style.display = 'block';
    flipFrontPlaceholder.style.display = 'none';
  } else {
    flipFrontImg.style.display = 'none';
    flipFrontPlaceholder.style.display = 'flex';
    flipFrontPlaceholder.textContent = t.name.charAt(0);
  }
  flipFrontImg.onerror = function(){this.style.display='none'; flipFrontPlaceholder.style.display='flex'; flipFrontPlaceholder.textContent=t.name.charAt(0);};
  flipFrontName.textContent = t.name;
  
  // 翻转卡片 - 背面（隐藏人格）标准化布局
  var flipBackImg = document.getElementById('flipBackImg');
  var flipBackPlaceholder = document.getElementById('flipBackPlaceholder');
  var flipBackName = document.getElementById('flipBackName');
  var flipBackSlogan = document.getElementById('flipBackSlogan');
  var flipBackCode = document.getElementById('flipBackCode');
  var flipBackRarity = document.getElementById('flipBackRarity');
  var flipBackExtra = document.getElementById('flipBackExtra');
  
  // 背面内容根据隐藏人格状态设置
  if(window.triggeredHidden){
    // 已触发隐藏人格 → 背面直接设置图片和完整信息
    var h = window.triggeredHidden;
    var hImgPath = fixImgPath(h.img);
    // 直接设置隐藏人格图片（和正面图片设置方式完全一致）
    if(flipBackImg && hImgPath){
      flipBackImg.src = hImgPath;
      flipBackImg.style.display = 'block';
      flipBackImg.onerror = function(){
        this.style.display='none';
        if(flipBackPlaceholder){
          flipBackPlaceholder.style.display='flex';
          flipBackPlaceholder.textContent = h.name.charAt(0);
        }
      };
      if(flipBackPlaceholder) flipBackPlaceholder.style.display = 'none';
    } else {
      if(flipBackImg) flipBackImg.style.display = 'none';
      if(flipBackPlaceholder){
        flipBackPlaceholder.style.display = 'flex';
        flipBackPlaceholder.textContent = h.name.charAt(0);
      }
    }
    if(flipBackName) flipBackName.textContent = h.name;
    if(flipBackSlogan) flipBackSlogan.textContent = '"' + (h.slogan || '') + '"';
    if(flipBackCode) flipBackCode.textContent = '[' + (h.code || 'HIDDEN') + ']';
    if(flipBackRarity) flipBackRarity.textContent = h.rarity;
    // 背面只保留基础信息，去掉标签/吐槽/治愈
    if(flipBackExtra) flipBackExtra.innerHTML = '';
    flipCardBack.classList.remove('locked');
  } else {
    // 未触发隐藏人格 → 背面显示占位提示（文字整合到占位区域）
    if(flipBackImg) flipBackImg.style.display = 'none';
    if(flipBackPlaceholder){
      flipBackPlaceholder.style.display = 'flex';
      flipBackPlaceholder.innerHTML = `
<div style="font-size:36px;font-weight:700;background:linear-gradient(135deg,#ffd700,#ffaa00);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:12px;text-align:center;">隐藏人格</div>
<div style="font-size:16px;color:#e9d5ff;margin-bottom:8px;text-align:center;font-style:italic;">"你的隐藏人格选择隐身。"</div>
<div style="font-size:14px;color:#d8b4fe;margin-bottom:16px;text-align:center;">约80% 的用户未触发隐藏人格</div>
<div style="background:rgba(167,139,250,.2);color:#d8b4fe;padding:6px 16px;border-radius:12px;font-size:14px;font-weight:500;text-align:center;">#表里如一</div>
`;
    }
    // 隐藏原来的外部文字元素，已经整合到占位区域
    if(flipBackName) flipBackName.style.display = 'none';
    if(flipBackSlogan) flipBackSlogan.style.display = 'none';
    if(flipBackCode) flipBackCode.style.display = 'none';
    if(flipBackRarity){ flipBackRarity.textContent = ''; flipBackRarity.style.display = 'none'; }
    // 未触发隐藏人格 → 背面保留吐槽/治愈（标签已经放到上面占位区域）
    var noTriggerExtra = '';
    noTriggerExtra += '<div class="flip-back-locked-box flip-back-locked-roast"><div class="flip-back-locked-label">💬 隐藏吐槽</div><div class="flip-back-locked-text">不是每个人都有B面。</div></div>';
    noTriggerExtra += '<div class="flip-back-locked-box flip-back-locked-heal"><div class="flip-back-locked-label">✨ 隐藏治愈</div><div class="flip-back-locked-text">A面活得漂亮，也是本事。</div></div>';
    if(flipBackExtra) flipBackExtra.innerHTML = noTriggerExtra;
    flipCardBack.classList.add('locked');
  }
  
  // 翻转卡片正面 - 设置人格信息（名称/slogan/代码/稀有度）
  var flipFrontSlogan = document.getElementById('flipFrontSlogan');
  var flipFrontCode = document.getElementById('flipFrontCode');
  var flipFrontRarity = document.getElementById('flipFrontRarity');
  if(flipFrontName) flipFrontName.textContent = t.name;
  if(flipFrontSlogan) flipFrontSlogan.textContent = t.slogan || '';
  if(flipFrontCode) flipFrontCode.textContent = '[' + t.code + ']';
  if(flipFrontRarity && t.rarity) {
    if(t.isHidden) {
      flipFrontRarity.textContent = '🏆 隐藏人格触发 · 非标准分布';
    } else {
      flipFrontRarity.textContent = '📊 全站 ' + t.rarity.replace('%','') + '% 的人测出这个人格';
    }
    flipFrontRarity.style.display = 'inline-block';
  } else if(flipFrontRarity) {
    flipFrontRarity.style.display = 'none';
  }
  
  // 描述
  document.getElementById('resultDesc').innerHTML = t.desc.replace(/\n/g,'<br>');
  
  // 隐藏人格模块：重置并填充（触发时填充内容，但默认隐藏，等解锁后显示）
  var hiddenModules = document.getElementById('hiddenModules');
  var hiddenDesc = document.getElementById('hiddenDesc');
  var hiddenRoast = document.getElementById('hiddenRoast');
  var hiddenHeal = document.getElementById('hiddenHeal');
  var hiddenTags = document.getElementById('hiddenTags');
  if(hiddenModules){
    hiddenModules.style.display = 'none';
    hiddenModules.style.opacity = '0';
  }
  if(window.triggeredHidden){
    var h = window.triggeredHidden;
    if(hiddenDesc) hiddenDesc.innerHTML = (h.desc || '').replace(/\n/g,'<br>');
    if(hiddenRoast) hiddenRoast.textContent = h.roast || '';
    if(hiddenHeal) hiddenHeal.textContent = h.heal || '';
    if(hiddenTags){
      var hTagHtml = '';
      var hTags = (h.tags || []);
      for(var hi=0; hi<hTags.length; hi++){
        hTagHtml += '<span class="flip-back-locked-tag">' + hTags[hi] + '</span>';
      }
      hiddenTags.innerHTML = hTagHtml;
    }
  }
  
  // 解锁按钮控制（隐藏人格内容全部集中到翻转卡片背面）
  var unlockBtn = document.getElementById('unlockBtn');
  var flipFrontHint = document.getElementById('flipFrontHint');
  var hasQ17 = userChoices.length >= 17;
  
  if (window.triggeredHidden) {
    // 触发了隐藏人格
    if(window.hasUnlockedHidden){
      // 已解锁 → 不显示解锁按钮和翻转提示
      if(unlockBtn) unlockBtn.style.display = 'none';
      if(flipFrontHint) flipFrontHint.style.display = 'none';
    } else {
      // 未解锁 → 显示解锁按钮+翻转提示，点击后卡片翻转揭晓
      if(unlockBtn) unlockBtn.style.display = 'block';
      if(flipFrontHint){
        flipFrontHint.style.display = 'flex';
        flipFrontHint.innerHTML = '<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:#ffd700"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg><span>解锁后将翻转卡片揭晓隐藏人格</span>';
      }
    }
    // 底部裂变引导
    document.getElementById('fissureMain').textContent = '测完别走，拉个朋友下水';
    document.getElementById('fissureSub').textContent = '看看朋友的隐藏人格是什么';
  } else if (!hasQ17) {
    // 没答Q17 → 不显示解锁按钮，显示翻转提示
    if(unlockBtn) unlockBtn.style.display = 'none';
    if(flipFrontHint) flipFrontHint.style.display = 'flex';
    // 裂变引导：未出现Q17
    document.getElementById('fissureMain').textContent = '🔒 你的隐藏人格埋得太深了——拉个朋友来挖挖？';
    document.getElementById('fissureSub').textContent = '看看朋友能不能触发隐藏题';
  } else {
    // 答了Q17但没触发隐藏人格
    if(window.hasUnlockedHidden){
      // 已解锁（揭晓过"未触发"）→ 不显示解锁按钮，显示翻转提示引导查看背面
      if(unlockBtn) unlockBtn.style.display = 'none';
      if(flipFrontHint) flipFrontHint.style.display = 'flex';
    } else {
      // 未解锁 → 显示解锁按钮，点击后揭晓"未触发"
      if(unlockBtn) unlockBtn.style.display = 'block';
      if(flipFrontHint) flipFrontHint.style.display = 'none';
    }
    // 裂变引导：未触发
    document.getElementById('fissureMain').textContent = '😭 80%的人测不出隐藏人格——你是那80%，还是你朋友是那20%？';
    document.getElementById('fissureSub').textContent = '拉个朋友来测，看看TA能不能触发';
  }
  
  // 毒舌金句 & 治愈金句
  document.getElementById('resultRoast').innerHTML = t.roast;
  document.getElementById('resultHeal').innerHTML = t.heal || '';
  
  // 标签
  var tagsHtml = '';
  var tagList = t.tags || ['#'+t.name];
  for(var ti=0;ti<tagList.length;ti++){
    tagsHtml+='<span class="tag-pill">'+tagList[ti]+'</span>';
  }
  document.getElementById('resultTags').innerHTML = tagsHtml;

  // 最配/最冲人格
  var matchEl = document.getElementById('resultMatch');
  if (matchEl && t.bestMatch && TYPES[t.bestMatch]) {
    var best = TYPES[t.bestMatch];
    var worst = TYPES[t.worstMatch] || null;
    var mHtml = '<div style="display:flex;gap:10px;margin:14px 0;">';
    mHtml += '<div style="flex:1;background:rgba(95,108,255,.08);border:1px solid rgba(95,108,255,.2);border-radius:12px;padding:12px;text-align:center;">';
    mHtml += '<div style="font-size:11px;color:#5f6cff;margin-bottom:5px;font-weight:600;">🔥 最配人格</div>';
    mHtml += '<div style="font-size:15px;font-weight:bold;color:#fff;">' + best.name + '</div>';
    mHtml += '<div style="font-size:10px;color:#777;margin-top:2px;">[' + best.code + ']</div>';
    mHtml += '</div>';
    if (worst) {
      mHtml += '<div style="flex:1;background:rgba(255,107,129,.08);border:1px solid rgba(255,107,129,.2);border-radius:12px;padding:12px;text-align:center;">';
      mHtml += '<div style="font-size:11px;color:#ff6b81;margin-bottom:5px;font-weight:600;">💥 最冲人格</div>';
      mHtml += '<div style="font-size:15px;font-weight:bold;color:#fff;">' + worst.name + '</div>';
      mHtml += '<div style="font-size:10px;color:#777;margin-top:2px;">[' + worst.code + ']</div>';
      mHtml += '</div>';
    }
    mHtml += '</div>';
    matchEl.innerHTML = mHtml;
    matchEl.style.display = 'block';
  } else if (matchEl) {
    matchEl.style.display = 'none';
  }

  // 核心冲突3：被邀请用户结果页顶部横幅
  var inviteBanner = document.getElementById('inviteBanner');
  var inviterCode = getInviter();
  if(inviteBanner && inviterCode && TYPES[inviterCode]){
    inviteBanner.style.display = 'block';
  } else if(inviteBanner){
    inviteBanner.style.display = 'none';
  }

  // 有邀请人时显示"查看默契度"按钮（保留作为备用入口）
  var compareWrap = document.getElementById('compareBtnWrap');
  if (compareWrap && inviterCode && TYPES[inviterCode]) {
    compareWrap.style.display = 'block';
  } else if (compareWrap) {
    compareWrap.style.display = 'none';
  }

  // P0-1: 用户分数持久化，供对比页能量条对比使用
  window.userScores = mainScores;

  // 更新人格图鉴入口链接
  var myTypeName = document.getElementById('myTypeName');
  var shareTypeName = document.getElementById('shareTypeName');
  if(myTypeName) myTypeName.textContent = t.name;
  if(shareTypeName) shareTypeName.textContent = t.name;
  window.typeCode = finalType;

  // 保存结果到 sessionStorage + localStorage，方便从图鉴页返回时恢复
  // localStorage 作为备用：部分手机浏览器/微信返回时会丢失 sessionStorage
  try {
    var hiddenKey = (window.triggeredHidden && window.triggeredHidden.key) || '';
    var saveData = {
      code: finalType,
      scores: JSON.stringify(mainScores),
      choices: JSON.stringify(userChoices),
      hasHiddenQuestion: window.hasHiddenQuestion ? '1' : '0',
      hasUnlockedHidden: window.hasUnlockedHidden ? '1' : '0',
      hiddenKey: hiddenKey
    };
    sessionStorage.setItem('bti_result_code', saveData.code);
    sessionStorage.setItem('bti_result_scores', saveData.scores);
    sessionStorage.setItem('bti_result_choices', saveData.choices);
    sessionStorage.setItem('bti_has_hidden_question', saveData.hasHiddenQuestion);
    sessionStorage.setItem('bti_has_unlocked_hidden', saveData.hasUnlockedHidden);
    sessionStorage.setItem('bti_hidden_key', saveData.hiddenKey);
    localStorage.setItem('bti_result_code', saveData.code);
    localStorage.setItem('bti_result_scores', saveData.scores);
    localStorage.setItem('bti_result_choices', saveData.choices);
    localStorage.setItem('bti_has_hidden_question', saveData.hasHiddenQuestion);
    localStorage.setItem('bti_has_unlocked_hidden', saveData.hasUnlockedHidden);
    localStorage.setItem('bti_hidden_key', saveData.hiddenKey);
    history.replaceState({page:'result'}, '', '#result=' + finalType);
  } catch(e) {}

  window.scrollTo(0,0);
  console.log('[BTI] Result:', t.name, t.code, 'img:', t.img);
}

// 获取常规内容模块（用于溶解切换）
function getFadeModules(){
  return [
    document.getElementById('dimBreakdown'),
    document.getElementById('resultDesc'),
    document.getElementById('mainRoastBox'),
    document.getElementById('mainHealBox'),
    document.getElementById('resultTags')
  ].filter(function(el){ return !!el; });
}

// 翻转卡片切换
function toggleFlipCard(){
  // 已解锁 或 未出现Q17（背面直接展示未触发状态）时允许翻转
  if(!window.hasUnlockedHidden && window.hasHiddenQuestion) return;
  var inner = document.getElementById('flipCardInner');
  if(!inner) return;
  inner.classList.toggle('flipped');
  
  // 已解锁+触发隐藏人格 → 翻转时同步切换常规模块/隐藏人格模块
  if(window.hasUnlockedHidden && window.triggeredHidden){
    var isFlipped = inner.classList.contains('flipped');
    var fadeEls = getFadeModules();
    var hm = document.getElementById('hiddenModules');
    if(isFlipped){
      // 翻到背面（隐藏人格）→ 常规模块淡出，隐藏模块淡入
      fadeEls.forEach(function(el){
        el.style.transition = 'opacity .6s ease';
        el.style.opacity = '0';
      });
      setTimeout(function(){
        fadeEls.forEach(function(el){ el.style.display = 'none'; });
        if(hm){
          hm.style.display = 'block';
          requestAnimationFrame(function(){
            hm.style.transition = 'opacity .6s ease';
            hm.style.opacity = '1';
          });
        }
      }, 600);
    } else {
      // 翻回正面（常规人格）→ 隐藏模块淡出，常规模块淡入
      if(hm){
        hm.style.transition = 'opacity .6s ease';
        hm.style.opacity = '0';
      }
      setTimeout(function(){
        if(hm) hm.style.display = 'none';
        fadeEls.forEach(function(el){
          el.style.display = 'block';
          el.style.opacity = '0';
        });
        requestAnimationFrame(function(){
          fadeEls.forEach(function(el){
            el.style.transition = 'opacity .6s ease';
            el.style.opacity = '1';
          });
        });
      }, 600);
    }
  }
}

// 解锁隐藏人格动画
function unlockHidden(){
  var overlay = document.getElementById('unlockOverlay');
  var icon = document.getElementById('unlockIcon');
  var text = document.getElementById('unlockText');
  var progress = document.getElementById('unlockProgress');
  var sub = document.getElementById('unlockSub');
  var unlockBtn = document.getElementById('unlockBtn');
  var flipBackImg = document.getElementById('flipBackImg');
  var flipBackPlaceholder = document.getElementById('flipBackPlaceholder');
  
  overlay.style.display = 'flex';
  
  // 阶段1：扫描
  setTimeout(function(){
    progress.style.width = '25%';
    text.textContent = '正在扫描你的B面...';
    sub.textContent = '检测信号中';
  }, 100);
  
  // 阶段2：检测到异常
  setTimeout(function(){
    progress.style.width = '55%';
    text.textContent = '⚠️ 检测到异常信号';
    sub.textContent = '信号强度：强';
    icon.textContent = '⚡';
  }, 900);
  
  // 阶段3：解析中
  setTimeout(function(){
    progress.style.width = '80%';
    text.textContent = '正在解析第二人格...';
    sub.textContent = '解码中，请稍候';
  }, 1800);
  
  // 阶段4：解锁成功
  setTimeout(function(){
    progress.style.width = '100%';
    var triggered = window.triggeredHidden;
    if(triggered){
      text.textContent = '🏆 你的隐藏人格已经现身了';
      sub.textContent = '已解锁：' + triggered.name;
      icon.textContent = '🔓';
      // 解锁时只更新翻转卡片背面的图片（其他内容已在showResult中设置好）
      var flipCardBack = document.getElementById('flipCardBack');
      var flipBackImg = document.getElementById('flipBackImg');
      var flipBackPlaceholder = document.getElementById('flipBackPlaceholder');
      
      if(flipCardBack) flipCardBack.classList.remove('locked');
      
      // 图片已在showResult中预加载，解锁后确保可见
      if(flipBackImg && flipBackImg.src && !flipBackImg.src.endsWith('/')){
        flipBackImg.style.display = 'block';
      }
    } else {
      text.textContent = '🔒 未检测到隐藏人格';
      sub.textContent = '想知道你的隐藏人格？再测一次试试';
      icon.textContent = '✓';
    }
  }, 2800);
  
  // 阶段5：关闭动画，显示结果
  setTimeout(function(){
    overlay.style.display = 'none';
    if(unlockBtn) unlockBtn.style.display = 'none';
    var flipFrontHint = document.getElementById('flipFrontHint');
    if(flipFrontHint) flipFrontHint.style.display = 'none';
    window.hasUnlockedHidden = true; // 标记已解锁
    try {
      sessionStorage.setItem('bti_has_unlocked_hidden', '1');
      localStorage.setItem('bti_has_unlocked_hidden', '1');
    } catch(e) {}
    var triggered = window.triggeredHidden;
    if(triggered){
      // 常规人格模块先淡出，再翻转卡片 → 溶解切换效果
      var fadeEls = getFadeModules();
      fadeEls.forEach(function(el){
        el.style.transition = 'opacity .7s ease';
        el.style.opacity = '0';
      });
      setTimeout(function(){
        var flipCardInner = document.getElementById('flipCardInner');
        if(flipCardInner) flipCardInner.classList.add('flipped');
        // 翻转完成后：隐藏常规模块 + 显示隐藏人格模块
        setTimeout(function(){
          fadeEls.forEach(function(el){ el.style.display = 'none'; });
          var hm = document.getElementById('hiddenModules');
          if(hm){
            hm.style.display = 'block';
            requestAnimationFrame(function(){
              hm.style.transition = 'opacity .6s ease';
              hm.style.opacity = '1';
            });
          }
        }, 600);
      }, 400);
    }
  }, 4000);
}

// 分析卡片 - 生成后弹窗预览，用户决定是否下载
function shareCard(){
  if(!resultTypeData){alert('没有结果数据');return;}
  var t=resultTypeData;
  var shareUrl = 'http://wangwangtt.top/bti?ref=' + (t.code || '');

  // 填充分享卡片内容
  var shareImgEl = document.getElementById('shareImg');
  shareImgEl.src = t.img || '';
  shareImgEl.onerror = function(){ this.style.display = 'none'; };
  shareImgEl.style.display = 'block';
  document.getElementById('shareName').textContent = t.name;
  document.getElementById('shareSlogan').textContent = t.slogan || '';

  // 稀有度显示（主人格）
  document.getElementById('shareCode').textContent = (t.code || '').toUpperCase();
  document.getElementById('shareRarity').textContent = '📊 全站 ' + (t.rarity || '').replace('%','') + '% 的人测出这个人格';

  // 人格化分享引导语（按人格定制）：SHARE_HOOKS 只存后半句动作，前半句自动拼接 slogan
  var ctaEl = document.getElementById('shareCta');
  if(ctaEl){
    var hook = SHARE_HOOKS[t.code]
      ? t.slogan + '——' + SHARE_HOOKS[t.code]
      : '👉 测测你是什么型';
    ctaEl.textContent = hook;
  }

  // 悬念钩子：隐藏人格只露首字（三种状态）
  var suspenseText = document.getElementById('shareSuspenseText');
  var suspenseHint = document.getElementById('shareSuspenseHint');
  var hasHQ = window.hasHiddenQuestion;
  var hasUnlocked = window.hasUnlockedHidden;

  if(!hasHQ){
    // 没出现隐藏题
    suspenseText.textContent = '我的隐藏人格选择隐身';
    suspenseHint.textContent = '来测测你的隐藏人格';
  } else if(hasHQ && !hasUnlocked){
    // 出现了但没解锁 → 最强悬念
    suspenseText.textContent = '我的隐藏人格是「???」';
    suspenseHint.textContent = '来解锁你的隐藏人格';
  } else if(window.triggeredHidden){
    // 已解锁 + 触发了 → 只露首字
    var h = window.triggeredHidden;
    var firstChar = (h.name || '').charAt(0);
    suspenseText.textContent = '我的隐藏人格是「' + firstChar + '...」';
    suspenseHint.textContent = '来看看你的隐藏人格';
  } else {
    // 已解锁 + 没触发
    suspenseText.textContent = '我的隐藏人格选择隐身';
    suspenseHint.textContent = '来测测你的隐藏人格';
  }

  // 显示加载中状态
  var overlay=document.getElementById('cardOverlay');
  var previewImg=document.getElementById('cardPreview');
  var cardActions=document.getElementById('cardActions');
  var wrap=document.getElementById('cardPreviewWrap');
  var cardShareLink=document.getElementById('cardShareLink');
  var cardShareLinkUrl=document.getElementById('cardShareLinkUrl');
  overlay.style.display='flex';
  previewImg.style.display='none';
  cardActions.style.display='none';
  if(cardShareLink) cardShareLink.style.display='none';
  document.getElementById('cardLoading').style.display='block';
  
  // 清理之前的预览内容
  wrap.innerHTML = '';
  wrap.appendChild(previewImg);
  
  // 渲染卡片到canvas
  var sa=document.getElementById('shareArea');
  sa.style.display='block';
  sa.style.position='fixed';sa.style.left='-9999px';sa.style.top='0';

  var isLocalFile = window.location.protocol === 'file:';
  
  setTimeout(function(){
    // 修复：html2canvas不支持background-clip:text，截图前用!important强制覆盖CSS规则
    var shareNameEl = document.getElementById('shareName');
    shareNameEl.style.setProperty('background', 'none', 'important');
    shareNameEl.style.setProperty('-webkit-background-clip', 'initial', 'important');
    shareNameEl.style.setProperty('background-clip', 'initial', 'important');
    shareNameEl.style.setProperty('-webkit-text-fill-color', '#ffffff', 'important');
    shareNameEl.style.setProperty('color', '#ffffff', 'important');

    // 本地file协议：直接显示DOM预览（无法截图但可预览效果）
    if(isLocalFile){
      // 恢复样式：移除强制覆盖的内联属性，让CSS重新生效
      shareNameEl.style.removeProperty('background');
      shareNameEl.style.removeProperty('-webkit-background-clip');
      shareNameEl.style.removeProperty('background-clip');
      shareNameEl.style.removeProperty('-webkit-text-fill-color');
      shareNameEl.style.removeProperty('color');
      sa.style.display='none';
      sa.style.position='';
      sa.style.left='';
      sa.style.top='';
      // 克隆shareArea到预览区域
      var clone = sa.cloneNode(true);
      clone.style.display = 'block';
      clone.style.position = 'relative';
      clone.style.left = '0';
      clone.style.top = '0';
      clone.style.transform = 'scale(0.85)';
      clone.style.transformOrigin = 'top center';
      clone.style.margin = '0 auto';
      wrap.style.display='block';
      wrap.appendChild(clone);
      previewImg.style.display='none';
      // 本地不显示保存按钮，只显示关闭
      cardActions.style.display='flex';
      var saveBtn = cardActions.querySelector('button:first-child');
      if(saveBtn) saveBtn.style.display = 'none';
      document.getElementById('cardLoading').style.display='none';
      // 添加提示
      var tip = document.createElement('div');
      tip.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);background:rgba(255,107,129,.9);color:#fff;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;z-index:10;';
      tip.textContent = '本地预览效果，部署后可保存图片';
      wrap.appendChild(tip);
      // 显示底部真实可点击链接
      if(cardShareLinkUrl){
        cardShareLinkUrl.href = shareUrl;
        cardShareLinkUrl.textContent = shareUrl;
      }
      if(cardShareLink) cardShareLink.style.display = 'block';
      return;
    }
    
    // 在线环境：html2canvas生成高清图片（scale:3平衡清晰度与文件大小）
    window.safeHtml2canvas(sa,{
      backgroundColor:'#12122a',scale:3,useCORS:true,
      allowTaint:true,logging:false
    }).then(function(canvas){
      // 恢复样式
      shareNameEl.style.removeProperty('background');
      shareNameEl.style.removeProperty('-webkit-background-clip');
      shareNameEl.style.removeProperty('background-clip');
      shareNameEl.style.removeProperty('-webkit-text-fill-color');
      shareNameEl.style.removeProperty('color');
      sa.style.display='none';
      sa.style.position='';
      sa.style.left='';
      sa.style.top='';
      // 在overlay中显示预览图
      wrap.style.display='block';
      previewImg.src=canvas.toDataURL('image/png');
      previewImg.style.display='block';
      cardActions.style.display='flex';
      var saveBtn = cardActions.querySelector('button:first-child');
      if(saveBtn) saveBtn.style.display = 'inline-block';
      document.getElementById('cardLoading').style.display='none';

      // 显示底部真实可点击链接
      if(cardShareLinkUrl){
        cardShareLinkUrl.href = shareUrl;
        cardShareLinkUrl.textContent = shareUrl;
      }
      if(cardShareLink) cardShareLink.style.display = 'block';

      // 存储下载链接
      previewImg.dataset.downloadUrl=canvas.toDataURL('image/png');
    }).catch(function(e){
      // 恢复样式
      shareNameEl.style.removeProperty('background');
      shareNameEl.style.removeProperty('-webkit-background-clip');
      shareNameEl.style.removeProperty('background-clip');
      shareNameEl.style.removeProperty('-webkit-text-fill-color');
      shareNameEl.style.removeProperty('color');
      sa.style.display='none';
      sa.style.position='';
      sa.style.left='';
      sa.style.top='';
      console.error('[BTI] shareCard error:',e);
      alert('生成失败，请稍后重试');overlay.style.display='none';
    });
  },300);
}

// 复制分享链接
function copyShareLink(){
  var linkText = document.getElementById('shareLinkText');
  var btn = document.getElementById('shareLinkBtn');
  if(!linkText) return;
  var url = linkText.textContent;
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(function(){
      showCopySuccess(btn);
    }).catch(function(){
      fallbackCopy(url, btn);
    });
  } else {
    fallbackCopy(url, btn);
  }
}

// 复制预览弹窗底部分享链接
function copyCardShareLink(){
  var linkText = document.getElementById('cardShareLinkUrl');
  var btn = document.getElementById('cardShareLinkCopy');
  if(!linkText) return;
  var url = linkText.textContent;
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(function(){
      showCopySuccess(btn);
    }).catch(function(){
      fallbackCopy(url, btn);
    });
  } else {
    fallbackCopy(url, btn);
  }
}

function fallbackCopy(text, btn){
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try{
    document.execCommand('copy');
    showCopySuccess(btn);
  }catch(e){
    alert('复制失败，请手动复制链接');
  }
  document.body.removeChild(ta);
}

function showCopySuccess(btn){
  if(!btn) return;
  var origText = btn.textContent;
  btn.textContent = '✅ 已复制';
  btn.classList.add('copied');
  setTimeout(function(){
    btn.textContent = origText;
    btn.classList.remove('copied');
  }, 2000);
}

// 下载卡片
function downloadCard(){
  var url=document.getElementById('cardPreview').dataset.downloadUrl;
  if(!url){alert('图片未准备好');return;}
  var link=document.createElement('a');
  var friendCode = getInviter();
  if(friendCode && document.getElementById('comparePage').style.display !== 'none'){
    link.download='BTI-默契度-'+resultTypeData.code+'-VS-'+friendCode+'.png';
  } else {
    link.download='BTI-'+resultTypeData.code+'-分析卡片.png';
  }
  link.href=url;link.click();
}

// 关闭卡片预览
function closeCardPreview(){
  document.getElementById('cardOverlay').style.display='none';
  var cardShareLink = document.getElementById('cardShareLink');
  if(cardShareLink) cardShareLink.style.display='none';
}

// ========== 裂变机制 ==========
function getUrlParam(name){
  var match = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
  return match && decodeURIComponent(match[1]);
}
function saveInviter(code){
  if(code) sessionStorage.setItem('bti_inviter', code);
}
function getInviter(){
  // P0-2: URL参数始终优先sessionStorage
  var urlRef = getUrlParam('ref');
  if(urlRef && TYPES[urlRef]) return urlRef;
  return sessionStorage.getItem('bti_inviter') || '';
}
function clearInviter(){
  sessionStorage.removeItem('bti_inviter');
}

// 页面加载时检查邀请
function checkInvite(){
  var ref = getUrlParam('ref');
  if(ref && TYPES[ref]){
    // P0-2: URL参数始终优先，覆盖sessionStorage
    saveInviter(ref);
    var inviter = TYPES[ref];
    var tip = document.getElementById('inviteTip');
    // P1-2: 被邀请欢迎页升级——展示朋友人格信息+明确"开始测试"按钮
    tip.innerHTML =
      '<div style="font-size:16px;margin-bottom:6px;">👋 你朋友是 <b style="color:#ffd700;">' + inviter.name + '</b></div>' +
      '<div style="font-size:15px;color:#ffd700;margin-bottom:8px;font-weight:700;">"' + inviter.slogan + '"</div>' +
      '<div style="font-size:14px;color:#1a1a2e;margin-bottom:10px;font-weight:700;">TA 邀你测测你的隐藏人格</div>' +
      '<button onclick="goTest()" style="background:linear-gradient(135deg,#ffd700,#ffaa00);color:#1a1a2e;border:none;padding:10px 28px;border-radius:20px;font-size:14px;font-weight:bold;cursor:pointer;">开始测试</button>';
    tip.style.display = 'block';
  }
}

// 默契度计算：基于人格代码维度重叠率
function getMatchScore(myCode, friendCode){
  if(!myCode || !friendCode || myCode.length !== 4 || friendCode.length !== 4) return 0;
  var same = 0;
  for(var i=0;i<4;i++){ if(myCode[i] === friendCode[i]) same++; }
  return Math.round(same / 4 * 100);
}

// 默契度文案
function getMatchLabel(score){
  if(score === 100) return {label:'复制粘贴', desc:'你们连反差都反得一模一样，建议直接拜把子。'};
  if(score >= 75) return {label:'灵魂同频', desc:'高度默契，一个眼神就能懂对方的烂梗。'};
  if(score >= 50) return {label:'互补共生', desc:'你们来自同一个星球的不同半球，碰撞才有火花。'};
  if(score >= 25) return {label:'互相好奇', desc:'你们互相理解不了，但互相吸引。危险又迷人。'};
  return {label:'跨物种交流', desc:'你们来自不同星球，建议先从翻译器开始。'};
}

// P1-1: 手动输入朋友代码对比
function manualCompare(){
  var input = document.getElementById('friendCodeInput');
  var code = (input.value || '').toUpperCase().trim();
  if(!code || code.length !== 4){ alert('请输入4位人格代码（如 HFLX）'); return; }
  if(!TYPES[code]){ alert('无效的人格代码，请检查后重新输入'); return; }
  // 保存手动输入的朋友代码到临时变量，供showCompare使用
  window.manualFriendCode = code;
  showCompare(code);
}

// 显示对比页（支持手动传入friendCode）
function showCompare(friendCode){
  var myCode = resultTypeData.code;
  // 优先使用传入的参数，其次是sessionStorage中的邀请人
  var fc = friendCode || getInviter();
  if(!fc || !TYPES[fc]){ alert('暂无邀请人数据'); return; }
  var my = resultTypeData;
  var friend = TYPES[fc];
  var score = getMatchScore(myCode, fc);
  var match = getMatchLabel(score);

  document.getElementById('result').style.display = 'none';
  document.getElementById('comparePage').style.display = 'block';
  window.scrollTo(0,0);

  document.getElementById('compareSelf').innerHTML =
    '<div style="font-size:13px;color:#ffffff;font-weight:700;margin-bottom:4px;">你</div>' +
    '<div style="font-size:18px;font-weight:bold;color:#fff;">' + my.name + '</div>' +
    '<div style="font-size:11px;color:#e5e7eb;">[' + myCode + ']</div>';
  document.getElementById('compareFriend').innerHTML =
    '<div style="font-size:13px;color:#ffffff;font-weight:700;margin-bottom:4px;">TA</div>' +
    '<div style="font-size:18px;font-weight:bold;color:#fff;">' + friend.name + '</div>' +
    '<div style="font-size:11px;color:#e5e7eb;">[' + fc + ']</div>';
  document.getElementById('compareScore').textContent = score + '%';
  document.getElementById('compareLabel').textContent = match.label;
  document.getElementById('compareDesc').textContent = match.desc;

  // 功能缺失2：四维能量条并排对比
  var dimBars = document.getElementById('compareDimBars');
  if(dimBars){
    var dims = [
      {key:'H', name:'精力', pair:['H','C']},
      {key:'F', name:'决策', pair:['F','S']},
      {key:'L', name:'社交', pair:['L','Q']},
      {key:'X', name:'应对', pair:['X','D']}
    ];
    var myDir = {H:myCode[0]==='H',C:myCode[0]==='C',F:myCode[1]==='F',S:myCode[1]==='S',L:myCode[2]==='L',Q:myCode[2]==='Q',X:myCode[3]==='X',D:myCode[3]==='D'};
    var friendDir = {H:fc[0]==='H',C:fc[0]==='C',F:fc[1]==='F',S:fc[1]==='S',L:fc[2]==='L',Q:fc[2]==='Q',X:fc[3]==='X',D:fc[3]==='D'};
    var barsHtml = '<div style="font-size:13px;color:#ffffff;font-weight:700;margin-bottom:12px;text-align:center;">🔥 四维能量对比</div>';
    dims.forEach(function(d){
      var myHot = myDir[d.pair[0]] ? 75 : 25;
      var friendHot = friendDir[d.pair[0]] ? 75 : 25;
      barsHtml += '<div style="margin-bottom:10px;">';
      barsHtml += '<div style="font-size:11px;color:#ffffff;font-weight:600;margin-bottom:4px;">' + d.name + '</div>';
      barsHtml += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">';
      barsHtml += '<div style="font-size:10px;color:#f3f4f6;font-weight:600;width:24px;">我</div>';
      barsHtml += '<div style="flex:1;height:6px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden;">';
      barsHtml += '<div style="width:' + myHot + '%;height:100%;background:linear-gradient(90deg,#ff6b81,#feca57);border-radius:3px;"></div>';
      barsHtml += '</div></div>';
      barsHtml += '<div style="display:flex;align-items:center;gap:8px;">';
      barsHtml += '<div style="font-size:10px;color:#f3f4f6;font-weight:600;width:24px;">TA</div>';
      barsHtml += '<div style="flex:1;height:6px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden;">';
      barsHtml += '<div style="width:' + friendHot + '%;height:100%;background:linear-gradient(90deg,#48dbfb,#5f6cff);border-radius:3px;"></div>';
      barsHtml += '</div></div></div>';
    });
    dimBars.innerHTML = barsHtml;
    dimBars.style.display = 'block';
  }

  // 功能缺失2：隐藏人格对比
  var hiddenCompare = document.getElementById('compareHidden');
  if(hiddenCompare){
    var hasMyHidden = window.triggeredHidden !== null;
    var hiddenHtml = '<div style="font-size:13px;color:#ffffff;font-weight:700;margin-bottom:12px;text-align:center;">🔒 隐藏人格对比</div>';
    hiddenHtml += '<div style="display:flex;gap:12px;">';
    hiddenHtml += '<div style="flex:1;padding:12px;background:rgba(255,255,255,.03);border-radius:10px;text-align:center;">';
    hiddenHtml += '<div style="font-size:11px;color:#ffffff;font-weight:600;margin-bottom:4px;">你</div>';
    if(hasMyHidden){
      var hiddenName = myHiddenLabel.textContent.replace('🏆 ','');
      hiddenHtml += '<div style="font-size:14px;color:#ffd700;font-weight:bold;">' + hiddenName + '</div>';
    } else {
      hiddenHtml += '<div style="font-size:14px;color:#a78bfa;font-weight:700;">🔒 未触发</div>';
      hiddenHtml += '<div style="font-size:11px;color:#e5e7eb;margin-top:4px;">#表里如一</div>';
    }
    hiddenHtml += '</div>';
    hiddenHtml += '<div style="flex:1;padding:12px;background:rgba(255,255,255,.03);border-radius:10px;text-align:center;">';
    hiddenHtml += '<div style="font-size:11px;color:#ffffff;font-weight:600;margin-bottom:4px;">TA</div>';
    hiddenHtml += '<div style="font-size:14px;color:#ffffff;font-weight:700;">❓ 未知</div>';
    hiddenHtml += '<div style="font-size:11px;color:#e5e7eb;margin-top:4px;">让TA也来测测</div>';
    hiddenHtml += '</div></div>';
    hiddenCompare.innerHTML = hiddenHtml;
    hiddenCompare.style.display = 'block';
  }

  // 功能缺失2+5：关系深度解读（含传播钩子）
  var relation = document.getElementById('compareRelation');
  if(relation){
    var hookText = '';
    if(score >= 75) hookText = '一个眼神就能懂对方的烂梗';
    else if(score >= 50) hookText = '碰撞才有火花';
    else if(score >= 25) hookText = '危险又迷人';
    else hookText = '建议先从翻译器开始';
    var relationHtml = '<div style="font-size:13px;color:#ffd700;font-weight:600;margin-bottom:8px;">💡 关系解读</div>';
    relationHtml += '<div style="font-size:13px;color:#ffffff;line-height:1.6;">';
    relationHtml += '你们的默契度是 <span style="color:#ffd700;font-weight:bold;">' + score + '%</span>——' + match.label + '。';
    relationHtml += match.desc + ' ' + hookText + '。';
    relationHtml += '</div>';
    relationHtml += '<div style="margin-top:10px;padding:10px;background:rgba(255,215,0,.06);border-radius:8px;border:1px solid rgba(255,215,0,.15);">';
    relationHtml += '<div style="font-size:12px;color:#ffd700;text-align:center;">';
    relationHtml += '📸 截图发朋友圈，让大家知道你们' + (score >= 50 ? '有多默契' : '有多反差') + '！';
    relationHtml += '</div></div>';
    relation.innerHTML = relationHtml;
    relation.style.display = 'block';
  }

  // P0-3: 对比页分享带当前用户代码（B分享给C，C看到的是B邀请的）
  var baseUrl = 'http://wangwangtt.top/bti';
  var shareUrl = baseUrl + '?ref=' + myCode;
  var shareBox = document.getElementById('compareShareBox');
  var shareUrlEl = document.getElementById('compareShareUrl');
  if(shareBox && shareUrlEl){
    shareUrlEl.textContent = shareUrl;
    shareUrlEl.href = shareUrl;
    shareBox.style.display = 'block';
  }
}

// 功能缺失4：对比页返回按钮
function backToResult(){
  document.getElementById('comparePage').style.display = 'none';
  document.getElementById('result').style.display = 'block';
  window.scrollTo(0,0);
}


// goTest 已在 index.html 内联脚本中定义，处理 JS 未加载完成的情况


// ========== 自动执行待启动的测试 ==========
if (window.BTI_PENDING) {
    window.BTI_PENDING = false;
    startQuiz();
}

// 页面加载时检查邀请
if(typeof checkInvite === 'function') checkInvite();

// 从图鉴页返回时恢复结果页
(function restoreResult(){
  // 只有从人格图鉴页返回时才自动恢复结果；直接打开首页不恢复
  var fromTypes = false;
  try { fromTypes = sessionStorage.getItem('bti_from_types') === '1'; } catch(e) {}
  if(!fromTypes){
    try { fromTypes = document.referrer && document.referrer.indexOf('types.html') !== -1; } catch(e) {}
  }
  if(!fromTypes) return;
  try { sessionStorage.removeItem('bti_from_types'); } catch(e) {}

  var restored = false;
  try {
    var savedCode = sessionStorage.getItem('bti_result_code') || localStorage.getItem('bti_result_code');
    var savedScoresStr = sessionStorage.getItem('bti_result_scores') || localStorage.getItem('bti_result_scores');
    var savedChoicesStr = sessionStorage.getItem('bti_result_choices') || localStorage.getItem('bti_result_choices');
    if(savedCode && savedScoresStr && savedChoicesStr) {
      var savedScores = JSON.parse(savedScoresStr);
      var savedChoices = JSON.parse(savedChoicesStr);
      // 恢复隐藏人格状态
      var savedHasHiddenQuestion = (sessionStorage.getItem('bti_has_hidden_question') || localStorage.getItem('bti_has_hidden_question')) === '1';
      var savedHasUnlockedHidden = (sessionStorage.getItem('bti_has_unlocked_hidden') || localStorage.getItem('bti_has_unlocked_hidden')) === '1';
      var savedHiddenKey = sessionStorage.getItem('bti_hidden_key') || localStorage.getItem('bti_hidden_key') || '';
      window.hasHiddenQuestion = savedHasHiddenQuestion;
      window.hasUnlockedHidden = savedHasUnlockedHidden;
      if(savedHiddenKey && typeof TYPES !== 'undefined' && TYPES[savedHiddenKey]) {
        window.triggeredHidden = TYPES[savedHiddenKey];
        window.triggeredHidden.key = savedHiddenKey;
      }
      // 恢复用户选择数据
      if(Array.isArray(savedChoices) && savedChoices.length > 0) {
        userChoices = savedChoices;
        // 恢复显示结果页（标记为恢复模式，避免重置解锁/触发状态）
        document.getElementById('home').style.display = 'none';
        showResult(savedScores, true);
        restored = true;
        console.log('[BTI] 已从图鉴页恢复结果:', savedCode);
        // 如果已解锁隐藏人格，直接应用已解锁的 UI 状态
        if(savedHasUnlockedHidden){
          var unlockBtn = document.getElementById('unlockBtn');
          if(unlockBtn) unlockBtn.style.display = 'none';
          var flipFrontHint = document.getElementById('flipFrontHint');
          if(flipFrontHint) flipFrontHint.style.display = 'none';
          // 只有真正触发了隐藏人格，才翻转卡片并展示隐藏人格模块
          if(window.triggeredHidden){
            var flipCardBack = document.getElementById('flipCardBack');
            if(flipCardBack) flipCardBack.classList.remove('locked');
            var flipCardInner = document.getElementById('flipCardInner');
            if(flipCardInner) flipCardInner.classList.add('flipped');
            var fadeEls = getFadeModules();
            fadeEls.forEach(function(el){ el.style.display = 'none'; });
            var hm = document.getElementById('hiddenModules');
            if(hm){
              hm.style.display = 'block';
              hm.style.opacity = '1';
            }
          }
        }
      }
    } else {
      console.log('[BTI] 无保存的结果，显示首页');
    }
  } catch(e) {
    console.error('[BTI] 恢复结果失败:', e);
  }
  // 无论恢复成功/失败，都移除首页预隐藏样式
  try {
    document.documentElement.classList.remove('bti-restoring');
  } catch(e2) {}
})();

// 强制启用开始按钮，避免本地加载卡住（最多1秒后自动可用）
setTimeout(function(){
  var startBtn = document.querySelector('.btn-start');
  if(startBtn && (startBtn.textContent.indexOf('准备中') !== -1 || startBtn.disabled)){
    startBtn.textContent = '开始测试';
    startBtn.disabled = false;
  }
}, 1000);

export function renderHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>B站举报工作台</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #f4efe7; color: #2c1a0e; min-height: 100vh; }
  header { background: #b74d2c; color: #fff; padding: 14px 24px; font-size: 18px; font-weight: 700; letter-spacing: 1px; }
  .container { max-width: 860px; margin: 24px auto; padding: 0 16px; }
  .card { background: #fff; border-radius: 10px; padding: 20px 24px; margin-bottom: 18px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  .card h2 { font-size: 15px; color: #b74d2c; margin-bottom: 14px; font-weight: 700; }
  label { display: block; font-size: 13px; color: #666; margin-bottom: 4px; margin-top: 10px; }
  input[type=text], input[type=number], select, textarea {
    width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px;
    font-size: 14px; background: #faf9f7; outline: none; font-family: inherit;
  }
  input:focus, select:focus, textarea:focus { border-color: #b74d2c; }
  .row { display: flex; gap: 12px; align-items: flex-end; }
  .row > * { flex: 1; }
  .row > .btn-wrap { flex: 0 0 auto; }
  button {
    padding: 8px 18px; border: none; border-radius: 6px; cursor: pointer;
    font-size: 14px; font-weight: 600; transition: background 0.15s;
  }
  .btn-primary { background: #b74d2c; color: #fff; }
  .btn-primary:hover { background: #9a3d22; }
  .btn-primary:disabled { background: #ccc; cursor: not-allowed; }
  .btn-secondary { background: #eee; color: #333; }
  .btn-secondary:hover { background: #ddd; }
  .status-tag {
    display: inline-block; padding: 3px 10px; border-radius: 12px;
    font-size: 12px; font-weight: 600; margin-left: 8px;
  }
  .status-idle { background: #eee; color: #888; }
  .status-running { background: #fff3cd; color: #856404; }
  .status-done { background: #d1e7dd; color: #0a5f38; }
  .status-error { background: #f8d7da; color: #842029; }
  .hint { font-size: 12px; color: #999; margin-top: 6px; }
  .warn-box { background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 10px 14px; font-size: 13px; color: #856404; margin-top: 10px; }
  .step-header { display: flex; align-items: center; margin-bottom: 12px; }
  .step-num { background: #b74d2c; color: #fff; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; margin-right: 10px; flex-shrink: 0; }
  .step-title { font-size: 15px; font-weight: 700; color: #b74d2c; }
  #project-section { display: none; }
  .slice-list { font-size: 13px; color: #555; margin-top: 8px; line-height: 1.8; }
  .merge-result { margin-top: 10px; font-size: 13px; color: #0a5f38; font-weight: 600; }
</style>
</head>
<body>
<header>B站举报工作台</header>
<div class="container">

  <!-- Cookie 设置 -->
  <div class="card">
    <h2>全局设置</h2>
    <label>B站 Cookie</label>
    <div class="row">
      <input type="text" id="cookie-input" placeholder="bili_jct=xxx; SESSDATA=xxx; ..." />
      <div class="btn-wrap"><button class="btn-primary" onclick="saveCookie()">保存</button></div>
    </div>
    <p class="hint">Cookie 将保存到 config/bili-cookie.txt，CLI 命令同步生效</p>
    <div id="cookie-msg" class="hint" style="color:#0a5f38"></div>
  </div>

  <!-- Project 切换 -->
  <div class="card">
    <h2>Project</h2>
    <label>输入动态 URL（自动提取 ID）</label>
    <div class="row">
      <input type="text" id="project-url" placeholder="https://www.bilibili.com/opus/123456789012345678" />
      <div class="btn-wrap"><button class="btn-primary" onclick="loadProject()">加载</button></div>
    </div>
    <div id="project-id-display" class="hint"></div>
  </div>

  <!-- 步骤面板 -->
  <div id="project-section">

    <!-- 步骤一：采集 -->
    <div class="card">
      <div class="step-header">
        <div class="step-num">1</div>
        <div class="step-title">采集评论</div>
        <span class="status-tag" id="collect-status-tag">未开始</span>
      </div>
      <label>动态 URL</label>
      <input type="text" id="collect-url" readonly />
      <label>输出路径</label>
      <input type="text" id="collect-out" readonly />
      <div class="row">
        <div>
          <label>模式</label>
          <select id="collect-mode">
            <option value="2">最新评论 (2)</option>
            <option value="3">热门评论 (3)</option>
          </select>
        </div>
        <div>
          <label>最大页数</label>
          <input type="number" id="collect-max-pages" value="300" min="1" />
        </div>
        <div>
          <label>请求间隔 (ms)</label>
          <input type="number" id="collect-delay" value="800" min="0" />
        </div>
      </div>
      <div style="margin-top:14px">
        <button class="btn-primary" id="collect-btn" onclick="startCollect()">开始采集</button>
      </div>
      <div id="collect-progress" class="hint" style="margin-top:8px"></div>
    </div>

    <!-- 步骤二：规范化 -->
    <div class="card">
      <div class="step-header">
        <div class="step-num">2</div>
        <div class="step-title">规范化</div>
        <span class="status-tag" id="normalize-status-tag">未开始</span>
      </div>
      <p style="font-size:13px;color:#555">清洗、去重、证据类型初筛，生成统一格式 CSV</p>
      <div style="margin-top:12px">
        <button class="btn-primary" onclick="startNormalize()">开始规范化</button>
      </div>
    </div>

    <!-- 步骤三：切片 -->
    <div class="card">
      <div class="step-header">
        <div class="step-num">3</div>
        <div class="step-title">切片</div>
        <span class="status-tag" id="slice-status-tag">未开始</span>
      </div>
      <label>每片行数</label>
      <input type="number" id="slice-size" value="200" min="1" style="width:120px" />
      <div style="margin-top:12px">
        <button class="btn-primary" onclick="startSlice()">开始切片</button>
      </div>
      <div id="slice-list" class="slice-list"></div>
      <div class="warn-box" id="slice-hint" style="display:none">
        切片已生成。请将 <code>data/{id}/slices/</code> 下的 CSV 文件交给 AI 打标（参照 AI判断prompt模板.md），
        完成后点下方「合并」按钮。
      </div>
    </div>

    <!-- 步骤四：合并 -->
    <div class="card">
      <div class="step-header">
        <div class="step-num">4</div>
        <div class="step-title">合并</div>
        <span class="status-tag" id="merge-status-tag">未开始</span>
      </div>
      <p style="font-size:13px;color:#555">扫描所有切片，将 reason 非空的行合并到 approved.csv</p>
      <div style="margin-top:12px">
        <button class="btn-primary" onclick="startMerge()">合并已打标条目</button>
      </div>
      <div id="merge-result" class="merge-result"></div>
    </div>

  </div>
</div>

<script>
let currentProjectId = null;

// ── Cookie ──
async function loadCookie() {
  const r = await fetch('/api/cookie').then(r => r.json());
  document.getElementById('cookie-input').value = r.cookie || '';
}

async function saveCookie() {
  const cookie = document.getElementById('cookie-input').value.trim();
  await fetch('/api/cookie', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ cookie }) });
  const msg = document.getElementById('cookie-msg');
  msg.textContent = '已保存';
  setTimeout(() => { msg.textContent = ''; }, 2000);
}

// ── Project ──
async function loadProject() {
  const url = document.getElementById('project-url').value.trim();
  const match = url.match(/opus\/(\d+)/);
  if (!match) { alert('无法从 URL 中提取动态 ID，请检查链接格式'); return; }
  const id = match[1];
  currentProjectId = id;

  const r = await fetch('/api/project/' + id + '/config').then(r => r.json());
  document.getElementById('project-id-display').textContent = 'Project ID: ' + id;
  document.getElementById('project-section').style.display = 'block';

  // 填充各步骤默认值
  document.getElementById('collect-url').value = url;
  document.getElementById('collect-out').value = r.paths.raw;

  // 还原上次保存的配置
  const cfg = r.config || {};
  if (cfg.collectMode) document.getElementById('collect-mode').value = cfg.collectMode;
  if (cfg.collectMaxPages) document.getElementById('collect-max-pages').value = cfg.collectMaxPages;
  if (cfg.collectDelay) document.getElementById('collect-delay').value = cfg.collectDelay;
  if (cfg.sliceSize) document.getElementById('slice-size').value = cfg.sliceSize;

  // 恢复切片列表
  await refreshSliceList();

  setTag('collect-status-tag', 'idle', '未开始');
  setTag('normalize-status-tag', 'idle', '未开始');
  setTag('slice-status-tag', 'idle', '未开始');
  setTag('merge-status-tag', 'idle', '未开始');
}

// ── 工具函数 ──
function setTag(id, type, text) {
  const el = document.getElementById(id);
  el.className = 'status-tag status-' + type;
  el.textContent = text;
}

async function refreshSliceList() {
  if (!currentProjectId) return;
  const r = await fetch('/api/project/' + currentProjectId + '/slices').then(r => r.json());
  const listEl = document.getElementById('slice-list');
  const hintEl = document.getElementById('slice-hint');
  if (r.slices && r.slices.length > 0) {
    listEl.textContent = '已有切片：' + r.slices.join('  ');
    hintEl.style.display = 'block';
    hintEl.innerHTML = '切片已生成（' + r.slices.length + ' 个）。请将 <code>data/' + currentProjectId + '/slices/</code> 下的 CSV 文件交给 AI 打标（参照 AI判断prompt模板.md），完成后点下方「合并」按钮。';
  } else {
    listEl.textContent = '';
    hintEl.style.display = 'none';
  }
}

async function saveConfig() {
  if (!currentProjectId) return;
  await fetch('/api/project/' + currentProjectId + '/config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      collectMode: document.getElementById('collect-mode').value,
      collectMaxPages: document.getElementById('collect-max-pages').value,
      collectDelay: document.getElementById('collect-delay').value,
      sliceSize: document.getElementById('slice-size').value
    })
  });
}

// ── 步骤一：采集 ──
let collectPollTimer = null;

async function startCollect() {
  if (!currentProjectId) return;
  await saveConfig();
  const btn = document.getElementById('collect-btn');
  btn.disabled = true;
  setTag('collect-status-tag', 'running', '运行中...');

  await fetch('/api/project/' + currentProjectId + '/collect', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: document.getElementById('collect-url').value,
      mode: document.getElementById('collect-mode').value,
      maxPages: document.getElementById('collect-max-pages').value,
      delayMs: document.getElementById('collect-delay').value
    })
  });

  collectPollTimer = setInterval(pollCollectStatus, 2000);
}

async function pollCollectStatus() {
  const r = await fetch('/api/project/' + currentProjectId + '/collect/status').then(r => r.json());
  const progressEl = document.getElementById('collect-progress');
  if (r.running) {
    progressEl.textContent = '已抓取 ' + r.pages + ' 页，共 ' + r.count + ' 条评论...';
    return;
  }
  clearInterval(collectPollTimer);
  document.getElementById('collect-btn').disabled = false;
  if (r.error) {
    setTag('collect-status-tag', 'error', '失败');
    progressEl.textContent = '错误：' + r.error;
  } else if (r.done) {
    setTag('collect-status-tag', 'done', '完成');
    progressEl.textContent = '完成：共 ' + r.count + ' 条，' + r.pages + ' 页';
  }
}

// ── 步骤二：规范化 ──
async function startNormalize() {
  if (!currentProjectId) return;
  setTag('normalize-status-tag', 'running', '运行中...');
  const r = await fetch('/api/project/' + currentProjectId + '/normalize', { method: 'POST' }).then(r => r.json());
  if (r.error) {
    setTag('normalize-status-tag', 'error', '失败');
    alert('规范化失败：' + r.error);
  } else {
    setTag('normalize-status-tag', 'done', '完成');
  }
}

// ── 步骤三：切片 ──
async function startSlice() {
  if (!currentProjectId) return;
  await saveConfig();
  setTag('slice-status-tag', 'running', '运行中...');
  const r = await fetch('/api/project/' + currentProjectId + '/slice', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ size: document.getElementById('slice-size').value })
  }).then(r => r.json());
  if (r.error) {
    setTag('slice-status-tag', 'error', '失败');
    alert('切片失败：' + r.error);
  } else {
    setTag('slice-status-tag', 'done', '完成');
    await refreshSliceList();
  }
}

// ── 步骤四：合并 ──
async function startMerge() {
  if (!currentProjectId) return;
  setTag('merge-status-tag', 'running', '运行中...');
  const r = await fetch('/api/project/' + currentProjectId + '/merge', { method: 'POST' }).then(r => r.json());
  const resultEl = document.getElementById('merge-result');
  if (r.error) {
    setTag('merge-status-tag', 'error', '失败');
    resultEl.style.color = '#842029';
    resultEl.textContent = '失败：' + r.error;
  } else {
    setTag('merge-status-tag', 'done', '完成');
    resultEl.style.color = '#0a5f38';
    resultEl.textContent = '已合并到 ' + r.out;
  }
}

// 初始化
loadCookie();
</script>
</body>
</html>`;
}

export function renderHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>评论复核台</title>
  <style>
    :root {
      --bg: #f4efe7;
      --panel: #fffaf4;
      --ink: #1f1d1a;
      --accent: #b74d2c;
      --line: #dbcdbb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Microsoft YaHei UI", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(183,77,44,.15), transparent 35%),
        linear-gradient(135deg, #f8f3ea, #efe4d2);
      color: var(--ink);
    }
    main {
      max-width: 960px;
      margin: 32px auto;
      padding: 0 16px 48px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 20px;
      box-shadow: 0 10px 30px rgba(75, 52, 31, 0.08);
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }
    label {
      display: block;
      font-size: 13px;
      margin-bottom: 6px;
    }
    input, textarea, select, button {
      width: 100%;
      font: inherit;
    }
    input, textarea, select {
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: white;
    }
    textarea {
      min-height: 120px;
      resize: vertical;
    }
    .actions {
      display: flex;
      gap: 12px;
      margin-top: 16px;
    }
    .actions button {
      border: 0;
      border-radius: 999px;
      padding: 12px 18px;
      cursor: pointer;
      background: var(--accent);
      color: white;
    }
    .actions button.secondary {
      background: #695a4c;
    }
    .content {
      display: grid;
      gap: 16px;
    }
    .pill {
      display: inline-block;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 10px;
      margin-right: 8px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <main>
    <div class="panel">
      <h1>评论复核台</h1>
      <p id="summary">加载中...</p>
      <div class="meta">
        <div><span class="pill" id="commentId">comment_id</span></div>
        <div><span class="pill" id="uid">uid</span></div>
        <div><span class="pill" id="evidence">evidence_type</span></div>
        <div><span class="pill" id="status">status</span></div>
      </div>
      <div class="content">
        <div>
          <label>原始评论</label>
          <textarea id="contentRaw"></textarea>
        </div>
        <div>
          <label>规范化文本</label>
          <textarea id="contentNormalized"></textarea>
        </div>
        <div class="meta">
          <div>
            <label>reason</label>
            <select id="reason"></select>
          </div>
          <div>
            <label>reason_confidence</label>
            <input id="confidence" />
          </div>
          <div>
            <label>manual_review</label>
            <select id="manualReview">
              <option value="pending">pending</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
              <option value="skip">skip</option>
            </select>
          </div>
          <div>
            <label>status</label>
            <select id="rowStatus">
              <option value="queued">queued</option>
              <option value="reviewed">reviewed</option>
              <option value="skipped">skipped</option>
            </select>
          </div>
        </div>
        <div>
          <label>配图 / 链接</label>
          <textarea id="pictureUrls"></textarea>
        </div>
      </div>
      <div class="actions">
        <button id="saveBtn">保存当前</button>
        <button id="nextBtn" class="secondary">保存并下一条</button>
      </div>
    </div>
  </main>
  <script>
    let rows = [];
    let allowedReasons = [];
    let currentIndex = 0;

    async function loadData() {
      const response = await fetch('/api/data');
      const payload = await response.json();
      rows = payload.rows;
      allowedReasons = payload.allowedReasons;
      const select = document.getElementById('reason');
      select.innerHTML = '<option value=""></option>' + allowedReasons
        .map((reason) => '<option value="' + reason + '">' + reason + '</option>')
        .join('');
      render();
    }

    function render() {
      const row = rows[currentIndex];
      if (!row) {
        document.getElementById('summary').textContent = '没有更多记录';
        return;
      }
      document.getElementById('summary').textContent = '第 ' + (currentIndex + 1) + ' / ' + rows.length + ' 条';
      document.getElementById('commentId').textContent = row.comment_id || 'comment_id';
      document.getElementById('uid').textContent = row.uid || 'uid';
      document.getElementById('evidence').textContent = row.evidence_type || 'evidence_type';
      document.getElementById('status').textContent = row.status || 'status';
      document.getElementById('contentRaw').value = row.content_raw || '';
      document.getElementById('contentNormalized').value = row.content_normalized || '';
      document.getElementById('reason').value = row.reason || '';
      document.getElementById('confidence').value = row.reason_confidence || '';
      document.getElementById('manualReview').value = row.manual_review || 'pending';
      document.getElementById('rowStatus').value = row.status || 'queued';
      document.getElementById('pictureUrls').value = row.picture_urls || '';
    }

    function collectForm() {
      const row = rows[currentIndex];
      return {
        ...row,
        content_raw: document.getElementById('contentRaw').value,
        content_normalized: document.getElementById('contentNormalized').value,
        reason: document.getElementById('reason').value,
        reason_confidence: document.getElementById('confidence').value,
        manual_review: document.getElementById('manualReview').value,
        status: document.getElementById('rowStatus').value,
        picture_urls: document.getElementById('pictureUrls').value
      };
    }

    async function save(andNext) {
      const payload = { index: currentIndex, row: collectForm() };
      const response = await fetch('/api/row', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      rows[currentIndex] = result.row;
      if (andNext && currentIndex < rows.length - 1) {
        currentIndex += 1;
      }
      render();
    }

    document.getElementById('saveBtn').addEventListener('click', () => save(false));
    document.getElementById('nextBtn').addEventListener('click', () => save(true));
    loadData();
  </script>
</body>
</html>`;
}

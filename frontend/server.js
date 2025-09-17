const express = require('express');
const os = require('os');
const morgan = require('morgan');
const fetch = require('node-fetch');
const fs = require('fs');

const PORT = process.env.PORT || 8080;
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:3000/api/info';
function resolveMessage() {
  const messageFromEnv = process.env.MESSAGE;
  const messageFilePath = process.env.MESSAGE_FILE;
  if (messageFilePath && fs.existsSync(messageFilePath)) {
    try {
      const content = fs.readFileSync(messageFilePath, 'utf8').trim();
      if (content) return content;
    } catch (_e) {
      // ignore and fallback
    }
  }
  return messageFromEnv || 'Hello from Frontend';
}
let MESSAGE = resolveMessage();

const app = express();
app.disable('x-powered-by');
morgan.token('hostname', () => os.hostname());
app.use(morgan(':date[iso] :remote-addr :method :url :status - host=:hostname - :response-time ms'));
app.use((_req, res, next) => {
  res.set('Connection', 'close');
  next();
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/id', (_req, res) => {
  res.json({ role: 'frontend', hostname: os.hostname(), timestamp: new Date().toISOString() });
});

app.get('/fanout', async (req, res) => {
  const n = Math.min(parseInt(String(req.query.n || '10'), 10) || 10, 50);
  const results = [];
  for (let i = 0; i < n; i++) {
    try {
      const fr = await fetch('http://frontend:8080/id', { timeout: 3000 });
      const fj = await fr.json();
      const br = await fetch(BACKEND_URL, { timeout: 3000 });
      const bj = await br.json();
      results.push({ index: i + 1, frontend: fj.hostname, backend: bj.hostname });
    } catch (e) {
      results.push({ index: i + 1, error: String(e && e.message ? e.message : e) });
    }
  }
  res.json({ count: n, results, at: new Date().toISOString() });
});

app.get('/ui', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Swarm Balanceamento - Frontend/Backend</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 24px; }
    h1 { margin: 0 0 8px; }
    .controls { display: flex; gap: 8px; align-items: center; margin: 12px 0 16px; }
    button { padding: 8px 12px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #eef; }
    .error { color: #b00020; }
    .ok { color: #0a7f2e; }
  </style>
  <script>
    async function runBatch(count = 10) {
      const tbody = document.querySelector('#results tbody');
      tbody.innerHTML = '';
      const calls = [];
      for (let i = 0; i < count; i++) {
        const startedAt = new Date();
        calls.push(
          fetch('/?t=' + Date.now() + '-' + i, { cache: 'no-store', headers: { 'Accept': 'application/json' } })
            .then(async r => {
              if (!r.ok) {
                const txt = await r.text().catch(() => '');
                throw new Error('HTTP ' + r.status + ' ' + r.statusText + (txt ? (' - ' + txt.slice(0, 200)) : ''));
              }
              return r.json();
            })
            .then(json => ({ ok: true, json, ms: new Date() - startedAt }))
            .catch(e => ({ ok: false, error: String(e), ms: new Date() - startedAt }))
        );
      }
      const results = await Promise.all(calls);
      results.forEach((r, idxNum) => {
        const tr = document.createElement('tr');
        const idx = document.createElement('td'); idx.textContent = String(idxNum + 1);
        const fhost = document.createElement('td');
        const bhost = document.createElement('td');
        const status = document.createElement('td');
        const latency = document.createElement('td'); latency.textContent = r.ms + ' ms';
        if (r.ok) {
          fhost.innerHTML = '<span class="pill">' + r.json.hostname + '</span>';
          bhost.innerHTML = (r.json.backend && r.json.backend.hostname) ? '<span class="pill">' + r.json.backend.hostname + '</span>' : '-';
          status.innerHTML = '<span class="ok">OK</span>';
        } else {
          fhost.textContent = '-';
          bhost.textContent = '-';
          status.innerHTML = '<span class="error">' + r.error + '</span>';
        }
        tr.appendChild(idx);
        tr.appendChild(fhost);
        tr.appendChild(bhost);
        tr.appendChild(status);
        tr.appendChild(latency);
        tbody.appendChild(tr);
      });
    }

    let autoId = null;
    function toggleAuto() {
      const btn = document.getElementById('auto');
      if (autoId) {
        clearInterval(autoId); autoId = null; btn.textContent = 'Auto (ligar)';
      } else {
        runBatch(10);
        autoId = setInterval(() => runBatch(10), 2000); btn.textContent = 'Auto (parar)';
      }
    }
    window.addEventListener('DOMContentLoaded', () => {
      document.getElementById('run').addEventListener('click', () => runBatch(10));
      document.getElementById('auto').addEventListener('click', toggleAuto);
    });
  </script>
  </head>
  <body>
    <h1>Swarm Balanceamento</h1>
    <div>Frontend chama o backend e exibe hostnames para evidenciar alternância entre réplicas.</div>
    <div class="controls">
      <button id="run">Testar (10 requisições)</button>
      <button id="auto">Auto (ligar)</button>
    </div>
    <table id="results">
      <thead>
        <tr>
          <th>#</th>
          <th>Frontend hostname</th>
          <th>Backend hostname</th>
          <th>Status</th>
          <th>Latência</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  </body>
  </html>`);
});

app.get('/', async (_req, res) => {
  try {
    const response = await fetch(BACKEND_URL, { timeout: 3000 });
    const backendInfo = await response.json();

    res.json({
      role: 'frontend',
      message: MESSAGE,
      hostname: os.hostname(),
      backend: backendInfo,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(502).json({
      role: 'frontend',
      message: MESSAGE,
      hostname: os.hostname(),
      backend_error: String(error && error.message ? error.message : error),
      timestamp: new Date().toISOString(),
    });
  }
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend listening on port ${PORT}, calling ${BACKEND_URL}`);
});
server.keepAliveTimeout = 0;
server.headersTimeout = 5000;



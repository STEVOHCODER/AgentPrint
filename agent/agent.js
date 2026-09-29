/**
 * AgentPrint Desktop Agent — install on the PC physically connected to the printer.
 *
 *  Loop: poll GET {backend}/api/agent/next?office=X&printer=Y every ~2.5s
 *        -> download file -> print via Windows spooler -> POST /ack
 *  Zero manual work. Also hosts a local dashboard at http://localhost:39500
 *
 *  Printing strategy (Windows):
 *   PDF    -> pdf-to-printer (native spooler, supports copies + printer name)
 *   Images -> mspaint /p (built into Windows, no deps)
 *   DOCX/PPTX/XLSX/TXT -> LibreOffice `soffice --convert-to pdf` if installed,
 *                         then print the PDF. If soffice missing, opens the file
 *                         with the default app and marks job failed with guidance.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const { execFile, exec } = require('child_process');

const ROOT = __dirname;
const JOBS_DIR = path.join(ROOT, 'jobs');
fs.mkdirSync(JOBS_DIR, { recursive: true });

function loadConfig() {
  const p = path.join(ROOT, 'config.json');
  const ex = path.join(ROOT, 'config.example.json');
  if (!fs.existsSync(p)) {
    console.log('⚠️  No config.json found. Copying from config.example.json — edit it then restart.');
    fs.copyFileSync(ex, p);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
const cfg = loadConfig();
cfg.backendUrl = (cfg.backendUrl || 'http://localhost:3000').replace(/\/$/, '');
cfg.pollIntervalMs = cfg.pollIntervalMs || 2500;

const state = { running: true, lastPoll: null, lastJob: null, log: [], busy: false };

function log(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  console.log(line);
  state.log.unshift(line);
  state.log = state.log.slice(0, 80);
}

// ---------- printing ----------
function printPdf(filePath, printerName, copies) {
  return new Promise((resolve, reject) => {
    try {
      const { print } = require('pdf-to-printer');
      const opts = {};
      if (printerName) opts.printer = printerName;
      if (copies > 1) opts.copies = copies;
      print(filePath, opts).then(resolve).catch(reject);
    } catch (e) {
      // fallback: SumatraPDF if present, else default PDF handler
      exec(`powershell -NoProfile -Command "Start-Process '${filePath}' -Verb Print"`, (err) => {
        err ? reject(err) : resolve();
      });
    }
  });
}

function printImage(filePath) {
  return new Promise((resolve, reject) => {
    // mspaint /p prints directly to default printer — built into Windows
    execFile('mspaint.exe', ['/p', filePath], { timeout: 60000 }, (err) => {
      err ? reject(err) : resolve();
    });
  });
}

function sofficePath() {
  const candidates = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return 'soffice'; // hope it's on PATH (Linux/Mac)
}

function convertOfficeToPdf(filePath) {
  return new Promise((resolve, reject) => {
    const outDir = path.dirname(filePath);
    execFile(sofficePath(), ['--headless', '--convert-to', 'pdf', '--outdir', outDir, filePath],
      { timeout: 90000 }, (err, stdout, stderr) => {
        if (err) return reject(new Error('LibreOffice convert failed. Install LibreOffice for DOCX/PPTX/XLSX auto-print.'));
        const pdf = filePath.replace(/\.[^.]+$/, '.pdf');
        fs.existsSync(pdf) ? resolve(pdf) : reject(new Error('Conversion produced no PDF'));
      });
  });
}

async function doPrint(job, filePath) {
  const ext = path.extname(job.filename).toLowerCase();
  const copies = job.copies || 1;
  if (ext === '.pdf') return printPdf(filePath, cfg.printerName, copies);
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    for (let i = 0; i < copies; i++) await printImage(filePath);
    return;
  }
  if (['.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls', '.txt'].includes(ext)) {
    const pdf = await convertOfficeToPdf(filePath);
    return printPdf(pdf, cfg.printerName, copies);
  }
  throw new Error('Unsupported file type: ' + ext);
}

// ---------- backend calls ----------
async function api(pathname, opts = {}) {
  const res = await fetch(cfg.backendUrl + pathname, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${pathname}`);
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.arrayBuffer();
}

async function pollOnce() {
  if (state.busy) return;
  state.lastPoll = new Date().toISOString();
  let data;
  try {
    data = await api(`/api/agent/next?office=${encodeURIComponent(cfg.officeCode)}&printer=${encodeURIComponent(cfg.printerId)}`);
  } catch (e) { log('poll error: ' + e.message); return; }
  const job = data && data.job;
  if (!job) return; // idle — normal
  state.busy = true;
  state.lastJob = job;
  log(`📥 Job ${job.id} — ${job.filename} (${job.copies}x) from ${job.sender}`);
  const dest = path.join(JOBS_DIR, `${job.id}-${job.filename.replace(/[^\w.\-]+/g, '_')}`);
  try {
    const buf = Buffer.from(await api(`/api/jobs/${job.id}/file`));
    fs.writeFileSync(dest, buf);
    if (cfg.autoPrint !== false) {
      await doPrint(job, dest);
      log(`✅ Printed ${job.id} — ready for pickup`);
    } else {
      log(`⏸️  Downloaded (autoPrint off): ${dest}`);
    }
    await api(`/api/jobs/${job.id}/ack`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'printed' }),
    });
  } catch (e) {
    log(`❌ Job ${job.id} failed: ${e.message}`);
    try {
      await api(`/api/jobs/${job.id}/ack`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'failed', message: e.message }),
      });
    } catch (_) {}
  } finally {
    state.busy = false;
  }
}

async function heartbeat() {
  try {
    await api('/api/agent/heartbeat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ officeCode: cfg.officeCode, printerId: cfg.printerId, pcName: os.hostname() }),
    });
  } catch (_) {}
}

// Optional instant push via socket.io (LAN/VPS hosts). Polling always stays on as fallback.
function trySocket() {
  try {
    const { io } = require('socket.io-client');
    const s = io(cfg.backendUrl, { reconnection: true });
    s.on('connect', () => {
      s.emit('join', { officeCode: cfg.officeCode, printerId: cfg.printerId, role: 'agent' });
      log('⚡ realtime channel connected');
    });
    s.on('job:new', () => pollOnce());
  } catch (_) { /* socket.io-client not installed — polling is enough */ }
}

// ---------- local dashboard ----------
const dash = http.createServer((req, res) => {
  const qr = `${cfg.backendUrl}/api/printers/${encodeURIComponent(cfg.officeCode)}/${encodeURIComponent(cfg.printerId)}/qr.png`;
  const printPage = `${cfg.backendUrl}/print.html?office=${encodeURIComponent(cfg.officeCode)}&printer=${encodeURIComponent(cfg.printerId)}`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AgentPrint Agent — ${cfg.printerId}</title>
<style>body{font-family:Segoe UI,Arial;margin:0;background:#0f172a;color:#e2e8f0}main{max-width:640px;margin:40px auto;padding:24px;background:#1e293b;border-radius:16px}h1{font-size:22px}a{color:#38bdf8}.ok{color:#4ade80}.qr{background:#fff;padding:12px;border-radius:12px;display:inline-block}pre{background:#0b1220;padding:12px;border-radius:8px;max-height:220px;overflow:auto;font-size:12px}</style>
</head><body><main>
<h1>🖨️ AgentPrint Agent <span class="ok">● running</span></h1>
<p><b>Office:</b> ${cfg.officeCode} &nbsp; <b>Printer:</b> ${cfg.printerId} &nbsp; <b>PC:</b> ${os.hostname()}</p>
<p><b>Backend:</b> <a href="${cfg.backendUrl}">${cfg.backendUrl}</a></p>
<p><b>Guest print page:</b><br><a href="${printPage}">${printPage}</a></p>
<p><span class="qr"><img src="${qr}" width="180" alt="QR"></span></p>
<p>Print this QR and stick it on the printer. Guests scan → upload → papers come out. No clicks needed here.</p>
<h3>Live log</h3><pre>${state.log.join('\n') || 'Waiting for jobs…'}</pre>
<p style="opacity:.7">Last poll: ${state.lastPoll || '—'} · Last job: ${state.lastJob ? state.lastJob.id + ' ' + state.lastJob.status : '—'}</p>
</main></body></html>`);
});

// ---------- boot ----------
log(`🖨️  AgentPrint agent starting — office ${cfg.officeCode}, printer ${cfg.printerId}`);
log(`Backend: ${cfg.backendUrl}`);
dash.listen(cfg.dashboardPort || 39500, () => log(`Local dashboard: http://localhost:${cfg.dashboardPort || 39500}`));
trySocket();
heartbeat();
setInterval(heartbeat, 30000);
(async function loop() {
  while (state.running) {
    await pollOnce();
    await new Promise(r => setTimeout(r, cfg.pollIntervalMs));
  }
})();

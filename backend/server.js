/**
 * AgentPrint Backend — multi-office QR print server.
 *
 *  Phone scans QR  ->  /print.html?office=ACME-1234&printer=reception
 *  Uploads file    ->  POST /api/jobs (queued)
 *  Desktop agent   ->  GET /api/agent/next?office=..&printer=.. (poll every 2.5s)
 *                   ->  GET /api/jobs/:id/file (download)
 *                   ->  POST /api/jobs/:id/ack { status: printed|failed }
 *  Realtime (LAN / VPS): Socket.io rooms office:{o}:printer:{p} emit job:new
 *
 * Works as: (a) standalone `node server.js`, (b) Vercel serverless via api/index.js
 */
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const QRCode = require('qrcode');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { db, key, save, makeCode, slug } = require('./lib/store');

const app = express();
app.set('trust proxy', 1); // correct https:// URLs when behind Vercel
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ---------- uploads (memory -> works on Vercel + local) ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (req, file, cb) => {
    const ok = /\.(pdf|jpe?g|png|webp|txt|docx?|pptx?|xlsx?)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only PDF, images, TXT, DOCX, PPTX, XLSX allowed'), ok);
  },
});

// Serve landing + print + admin UI
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- helpers ----------
function publicBase(req) {
  return (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}
function printUrl(req, office, printer) {
  return `${publicBase(req)}/print.html?office=${encodeURIComponent(office)}&printer=${encodeURIComponent(printer)}`;
}
function roomName(office, printer) {
  return `office:${office}:printer:${printer}`;
}
function emit(io, office, printer, evt, payload) {
  try { io && io.to(roomName(office, printer)).emit(evt, payload); } catch (_) {}
}
function safeJob(j) {
  const { buffer, ...rest } = j;
  return rest;
}

// ---------- offices ----------
app.post('/api/offices', (req, res) => {
  const name = (req.body.name || 'My Office').toString().slice(0, 80);
  const code = makeCode(name);
  db.offices[code] = { code, name, createdAt: new Date().toISOString() };
  // auto-create a first printer so QR works instantly
  const printerId = 'reception';
  db.printers[key(code, printerId)] = {
    officeCode: code, printerId, name: 'Reception Printer',
    location: 'Front desk', createdAt: new Date().toISOString(), online: false,
  };
  save();
  res.json({ office: db.offices[code], printer: db.printers[key(code, printerId)] });
});

app.get('/api/offices/:code', (req, res) => {
  const o = db.offices[req.params.code];
  if (!o) return res.status(404).json({ error: 'Unknown office code' });
  res.json(o);
});

// ---------- printers ----------
app.post('/api/printers', (req, res) => {
  const { officeCode, name, location } = req.body || {};
  if (!officeCode || !db.offices[officeCode]) return res.status(400).json({ error: 'Valid officeCode required' });
  const printerId = slug(name) + '-' + Math.floor(100 + Math.random() * 900);
  db.printers[key(officeCode, printerId)] = {
    officeCode, printerId,
    name: (name || 'Printer').toString().slice(0, 80),
    location: (location || '').toString().slice(0, 120),
    createdAt: new Date().toISOString(), online: false,
  };
  save();
  res.json(db.printers[key(officeCode, printerId)]);
});

app.get('/api/offices/:code/printers', (req, res) => {
  const list = Object.values(db.printers).filter(p => p.officeCode === req.params.code);
  res.json(list);
});

// QR sticker image: <img src="/api/printers/ACME-1234/reception/qr.png">
app.get('/api/printers/:office/:printer/qr.png', async (req, res) => {
  const { office, printer } = req.params;
  const url = printUrl(req, office, printer);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  await QRCode.toFileStream(res, url, { width: 512, margin: 2 });
});

// ---------- jobs ----------
app.post('/api/jobs', upload.single('file'), (req, res) => {
  try {
    const { officeCode, printerId, copies, color, sender } = req.body || {};
    if (!officeCode || !db.offices[officeCode]) return res.status(400).json({ error: 'Unknown officeCode' });
    if (!printerId || !db.printers[key(officeCode, printerId)]) return res.status(400).json({ error: 'Unknown printerId for this office' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const id = uuidv4().slice(0, 8);
    const job = {
      id, officeCode, printerId,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      copies: Math.min(Math.max(parseInt(copies || '1', 10) || 1, 1), 50),
      color: color === 'color',
      sender: (sender || 'Guest').toString().slice(0, 60),
      status: 'queued', // queued -> printing -> printed | failed
      createdAt: new Date().toISOString(),
      buffer: req.file.buffer,
    };
    db.jobs[id] = job;
    save();
    emit(req.app.get('io'), officeCode, printerId, 'job:new', safeJob(job));
    res.json({ job: safeJob(job), printUrl: printUrl(req, officeCode, printerId) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/offices/:code/jobs', (req, res) => {
  const list = Object.values(db.jobs)
    .filter(j => j.officeCode === req.params.code)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 100)
    .map(safeJob);
  res.json(list);
});

app.get('/api/jobs/:id', (req, res) => {
  const j = db.jobs[req.params.id];
  if (!j) return res.status(404).json({ error: 'Job not found' });
  res.json(safeJob(j));
});

// Agent downloads raw bytes
app.get('/api/jobs/:id/file', (req, res) => {
  const j = db.jobs[req.params.id];
  if (!j || !j.buffer) return res.status(404).send('File expired or unknown job');
  res.setHeader('Content-Type', j.mimetype || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${j.filename.replace(/"/g, '')}"`);
  res.send(j.buffer);
});

/** Agent poll: claim oldest queued job for this printer (Vercel-safe, no websockets needed). */
app.get('/api/agent/next', (req, res) => {
  const { office, printer } = req.query;
  if (!office || !printer) return res.status(400).json({ error: 'office & printer required' });
  const next = Object.values(db.jobs)
    .filter(j => j.officeCode === office && j.printerId === printer && j.status === 'queued')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
  if (!next) return res.json({ job: null });
  next.status = 'printing';
  next.claimedAt = new Date().toISOString();
  save();
  emit(req.app.get('io'), office, printer, 'job:claimed', safeJob(next));
  res.json({ job: safeJob(next) });
});

app.post('/api/jobs/:id/ack', (req, res) => {
  const j = db.jobs[req.params.id];
  if (!j) return res.status(404).json({ error: 'Job not found' });
  const { status, message } = req.body || {};
  if (!['printed', 'failed'].includes(status)) return res.status(400).json({ error: 'status must be printed|failed' });
  j.status = status;
  j.finishedAt = new Date().toISOString();
  if (message) j.message = String(message).slice(0, 300);
  // free RAM: drop bytes 10 min after completion
  setTimeout(() => { if (db.jobs[j.id]) { delete db.jobs[j.id].buffer; save(); } }, 10 * 60 * 1000);
  save();
  emit(req.app.get('io'), j.officeCode, j.printerId, 'job:update', safeJob(j));
  // auto-purge printed jobs metadata after 24h (keeps DB small)
  res.json(safeJob(j));
});

// Agent heartbeat -> admin sees Online
app.post('/api/agent/heartbeat', (req, res) => {
  const { officeCode, printerId, pcName } = req.body || {};
  const p = db.printers[key(officeCode, printerId)];
  if (p) { p.online = true; p.lastSeen = new Date().toISOString(); if (pcName) p.pcName = String(pcName).slice(0, 60); save(); }
  res.json({ ok: true, now: new Date().toISOString() });
});

// Multer / validation errors -> clean JSON (no HTML stack leak)
app.use((err, req, res, _next) => {
  if (res.headersSent) return _next(err);
  res.status(400).json({ error: err.message || 'Upload failed' });
});

app.get('/api/health', (req, res) => res.json({
  ok: true, service: 'agentprint', time: new Date().toISOString(),
  offices: Object.keys(db.offices).length,
  printers: Object.keys(db.printers).length,
  jobs: Object.keys(db.jobs).length,
}));

// ---------- socket.io attach (used in standalone mode) ----------
function attachSocket(server) {
  const { Server } = require('socket.io');
  const io = new Server(server, { cors: { origin: '*' } });
  app.set('io', io);
  io.on('connection', (socket) => {
    // agent: join office:{o}:printer:{p}  |  browser: same room for live status
    socket.on('join', ({ officeCode, printerId, role }) => {
      if (!officeCode || !printerId) return;
      socket.join(roomName(officeCode, printerId));
      const p = db.printers[key(officeCode, printerId)];
      if (p && role === 'agent') { p.online = true; p.lastSeen = new Date().toISOString(); save(); }
    });
  });
  return io;
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, () => console.log(`🖨️  AgentPrint backend on http://localhost:${PORT}`));
  attachSocket(server);
}

module.exports = { app, attachSocket };

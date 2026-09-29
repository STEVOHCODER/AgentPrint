/**
 * AgentPrint — multi-tenant in-memory store with JSON disk persistence.
 * Keyed by officeCode so ONE server can serve ANY office (SaaS-ready).
 *
 * NOTE on Vercel serverless: instances are stateless. This store survives
 * in-memory while the instance is warm (enough for instant scan->print,
 * where the agent polls within seconds). For persistent production queues,
 * set one of:
 *   - DATA_FILE (default ./data/agentprint.json) for always-on hosts
 *   - UPSTASH_REDIS_REST_URL + TOKEN (future adapter, interface ready)
 */
const fs = require('fs');
const path = require('path');

const DATA_FILE =
  process.env.DATA_FILE ||
  path.join(__dirname, '..', '..', 'uploads', 'agentprint-db.json');

const db = {
  offices: {},  // officeCode -> { code, name, createdAt }
  printers: {}, // `${office}:${printerId}` -> { officeCode, printerId, name, location, createdAt, online }
  jobs: {},     // jobId -> job object
};

function key(office, printer) {
  return `${office}:${printer}`;
}

function load() {
  if (process.env.VERCEL) return; // ephemeral fs — stay in-memory
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      Object.assign(db, parsed);
    }
  } catch (e) {
    console.warn('[store] load failed:', e.message);
  }
}

let saveTimer = null;
function save() {
  if (process.env.VERCEL) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    } catch (e) {
      console.warn('[store] save failed:', e.message);
    }
  }, 300);
}

function makeCode(name) {
  const clean = (name || 'OFFICE').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4).padEnd(4, 'X');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${clean}-${rand}`;
}

function slug(name) {
  return (name || 'printer')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'printer';
}

load();

module.exports = { db, key, save, makeCode, slug };

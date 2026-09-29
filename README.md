# 🖨️ AgentPrint — Scan. Send. Collect.

Walk-up office printing with **zero manual work**:

1. Guest **scans the QR sticker** on the printer with any phone camera
2. Uploads a **PDF / image / DOCX / PPTX / XLSX** from the mobile page
3. The **desktop agent on the printer PC** picks it up in ~2 seconds and prints — guest just collects the papers.

One cloud backend serves **any number of offices** — queues are isolated by `officeCode`.

```
phone (camera) ──scan──▶ /print.html?office=ACME-4821&printer=reception
                       ──upload──▶ POST /api/jobs (queued)
printer PC (agent) ◀──poll /api/agent/next every 2.5s── cloud (Vercel / VPS)
                   ──download──▶ /api/jobs/:id/file ──print──▶ Windows spooler
                   ──ack──▶ printed → guest page shows "Ready for pickup"
```

## Quick start (5 min, local demo)

```bat
cd "office print"
npm run install:all
REM terminal 1 — backend
npm --prefix backend start
REM terminal 2 — agent
cd agent && node setup.js && npm start
```

1. Open http://localhost:3000 → **Create office code** (e.g. `ACME-4821`)
2. Open the agent dashboard http://localhost:39500 → print the QR, or open `http://localhost:3000/admin.html?office=ACME-4821` for QR stickers
3. Scan the QR with your phone (or open the guest link) → upload a PDF → it prints on the agent PC 🎉

## Windows installer (production, printer PCs)

Ready-to-use, zero-dependency — office staff need NOTHING pre-installed (Node.js runtime is bundled):

```
installer/Output/AgentPrint-Setup-1.0.0.exe   (~30 MB, per-user install, no admin/UAC needed)
```

On each printer PC: run it → tick **Printer Agent** (add **Local backend** only for LAN-only offices without cloud) → run the config wizard (backend URL + office code + printer ID) → print the QR from `http://localhost:39500/` and stick it on the printer. The agent auto-starts with Windows, hidden. Uninstall keeps `agent\config.json` so a reinstall just works.

Rebuild after code changes:
```bat
pwsh -ExecutionPolicy Bypass -File installer\build-portable.ps1
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\AgentPrint.iss
```

## Phone access (same WiFi / hotspot)

The phone cannot use `localhost` — it must use the printer PC's LAN IP:

1. On the printer PC, allow inbound port 3000 once (admin click):
   `netsh advfirewall firewall add rule name="AgentPrint Backend 3000" dir=in action=allow protocol=TCP localport=3000`
2. Find the PC's WiFi IP (`ipconfig`, e.g. `192.168.43.2`) and on the PC open
   `http://192.168.43.2:3000/admin.html?office=YOUR-CODE` — **important:** open it
   via the IP, not localhost, so the QR stickers encode an address the phone can reach.
3. Connect the phone to the same WiFi/hotspot, scan the QR → upload → collect papers.

For guests on mobile data (outside the WiFi), expose the PC with ngrok
(`ngrok http 3000`) and use the `https://....ngrok.io` URL instead of the LAN IP.

## Deploy the cloud backend (multi-office SaaS)

### Option A — Vercel (frontend + API, instant print via polling)
```bash
npm i -g vercel
cd "office print"
vercel --prod
# set env: PUBLIC_BASE_URL=https://your-app.vercel.app
```
Point every office's agent at `https://your-app.vercel.app` with its own `officeCode + printerId`. Polling works serverlessly — no websockets needed.

> Note: Vercel functions are stateless, so queued files live in instance memory (fine for instant scan→print within seconds/minutes). For 24/7 persistent queues across many offices, use Option B for the backend and keep Vercel for the landing page.

### Option B — Always-on backend (Render / Railway / VPS, persistent + realtime)
- Push this folder to GitHub → **Render → New Web Service** → Build `npm --prefix backend install`, Start `npm --prefix backend start`
- Set `PUBLIC_BASE_URL` to the Render URL. The same agent + web UI work unchanged, plus Socket.io instant push.

## Printer-PC agent setup (each office, each printer)

1. Install Node.js LTS + (for Word/Excel/PowerPoint) LibreOffice free
2. Double-click `agent/install-agent.bat` → enter Backend URL, Office code, Printer ID
3. Stick the printed QR on the printer. Done — no clicks ever again.

`agent/config.json` binds one agent → one `officeCode + printerId`. Install it on every printer PC.

## Project layout

```
office print/
  backend/server.js        Express + Socket.io API (also exported for Vercel)
  backend/lib/store.js     multi-tenant store (officeCode-isolated)
  api/index.js             Vercel serverless entry
  public/                  landing + mobile print page + office dashboard
  agent/agent.js           Windows auto-print client (poll + print + ack)
  agent/install-agent.bat  2-minute Windows installer
  uploads/                 local file + DB persistence (git-ignored)
```

## API cheat-sheet

| Call | Purpose |
|---|---|
| `POST /api/offices` | create office → `{ office.code }` |
| `POST /api/printers` | add printer to office |
| `GET /api/printers/:office/:printer/qr.png` | QR sticker image |
| `POST /api/jobs` (multipart `file`) | guest upload → queued |
| `GET /api/agent/next?office=&printer=` | agent claims next job |
| `GET /api/jobs/:id/file` | agent downloads bytes |
| `POST /api/jobs/:id/ack` | agent reports `printed`/`failed` |
| `GET /print.html?office=&printer=` | guest page (QR target) |
| `GET /admin.html?office=` | QR + live queue dashboard |

Supported: **PDF, JPG/PNG/WEBP, TXT, DOCX, PPTX, XLSX** (25 MB max, open instant print).

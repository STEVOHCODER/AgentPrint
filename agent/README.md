# AgentPrint Desktop Agent (printer PC)

Runs on the Windows PC physically connected to the printer. Polls the cloud every ~2.5s and **auto-prints** — zero clicks.

## Install (2 min)
1. Install Node.js LTS → https://nodejs.org
2. Double-click **`install-agent.bat`** (installs deps + runs setup wizard)
3. Enter: Backend URL, Office code, Printer ID
4. For Word/Excel/PowerPoint auto-print, install LibreOffice (free): https://www.libreoffice.org/download/download/
5. Print the QR from the local dashboard (`http://localhost:39500`) and stick it on the printer.

## What it handles
| File | How it prints |
|---|---|
| PDF | Native spooler (`pdf-to-printer`), copies + printer name supported |
| JPG/PNG/WEBP | `mspaint /p` (built into Windows) |
| DOCX/PPTX/XLSX/TXT | Converted via LibreOffice `soffice` → PDF → printed |

## Multi-office
`config.json` binds ONE agent to ONE `officeCode + printerId`. Install the agent on every printer PC with its own IDs — one cloud backend serves all offices.

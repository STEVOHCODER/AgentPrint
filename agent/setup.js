/** Interactive first-run wizard: creates agent/config.json */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, def) => new Promise(r => rl.question(`${q}${def ? ` [${def}]` : ''}: `, a => r((a || '').trim() || def)));

(async () => {
  console.log('\n🖨️  AgentPrint agent setup\n');
  const backendUrl = await ask('Backend URL (Vercel app or http://localhost:3000)', 'http://localhost:3000');
  const officeCode = await ask('Office code (from admin page, e.g. ACME-4821)', '');
  const printerId = await ask('Printer ID (e.g. reception)', 'reception');
  const printerName = await ask('Windows printer name (empty = default printer)', '');
  rl.close();
  if (!officeCode) { console.log('❌ officeCode is required.'); process.exit(1); }
  const cfg = { backendUrl: backendUrl.replace(/\/$/, ''), officeCode, printerId, printerName, pollIntervalMs: 2500, dashboardPort: 39500, autoPrint: true };
  fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(cfg, null, 2));
  console.log('\n✅ Saved agent/config.json:');
  console.log(JSON.stringify(cfg, null, 2));
  console.log('\nNext: npm install && npm start');
})();

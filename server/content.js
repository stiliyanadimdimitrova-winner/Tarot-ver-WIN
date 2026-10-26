'use strict';
// Content bundle tool.
//   node server/content.js export  out.json
//   node server/content.js import  in.json [--dry-run]
const fs = require('fs');
const path = require('path');
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const { seedIfEmpty } = require('./seed');
const { exportBundle, importBundle } = require('./contentBundle');

(async () => {
  const [cmd, file, ...flags] = process.argv.slice(2);
  if (!['export', 'import'].includes(cmd) || !file) {
    console.error('Usage: node server/content.js export <out.json> | import <in.json> [--dry-run]');
    process.exit(2);
  }
  await seedIfEmpty();
  if (cmd === 'export') {
    fs.writeFileSync(file, JSON.stringify(exportBundle()));
    console.log('Written: ' + file);
  } else {
    const dryRun = flags.includes('--dry-run');
    const res = await importBundle(JSON.parse(fs.readFileSync(file, 'utf8')), { dryRun });
    console.log((dryRun ? 'Check passed (nothing written). ' : 'Imported. ') + JSON.stringify(res.counts));
  }
})().catch((e) => {
  console.error(e.message);
  for (const d of e.details || []) console.error('  - ' + d);
  process.exit(1);
});

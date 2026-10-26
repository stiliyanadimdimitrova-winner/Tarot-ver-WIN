'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tarot-bundle-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOADS_DIR = path.join(tmp, 'uploads');

const sharp = require('sharp');
const { seedIfEmpty } = require('../server/seed');
const { exportBundle, importBundle } = require('../server/contentBundle');
const { db } = require('../server/db');

test.before(async () => { await seedIfEmpty(); });
test.after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

test('export then import is lossless and placeholders are not exported', async () => {
  const b = exportBundle();
  assert.equal(b.format, 'tarot-content');
  assert.equal(Object.keys(b.zodiac).length, 8);
  assert.equal(Object.keys(b.arcana).length, 22);
  assert.equal(b.images.hero_bg, null);
  const res = await importBundle(JSON.parse(JSON.stringify(b)));
  assert.ok(res.counts.settings > 0);
  assert.deepEqual({ ...exportBundle(), exported_at: 0 }, { ...b, exported_at: 0 });
});

test('images are validated by content, stored under random names, old uploads are removed', async () => {
  const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#335' } }).png().toBuffer();
  const uri = 'data:image/png;base64,' + png.toString('base64');
  const b = exportBundle(); b.images.hero_bg = uri;
  await importBundle(b);
  const first = db.prepare("SELECT value_json FROM settings WHERE key = 'hero_bg'").get().value_json;
  assert.match(first, /\/uploads\/[0-9a-f]{32}\.png/);
  const b2 = exportBundle(); b2.images.hero_bg = uri;
  await importBundle(b2);
  const file = (p) => path.join(process.env.UPLOADS_DIR, path.basename(JSON.parse(p)));
  assert.ok(!fs.existsSync(file(first)), 'the replaced upload is deleted');
  const fake = exportBundle(); fake.images.hero_bg = 'data:image/png;base64,' + Buffer.from('<?php echo 1;').toString('base64');
  await assert.rejects(importBundle(fake), (e) => e.details.some((d) => d.startsWith('images.hero_bg')));
});

test('a bad part rejects the whole bundle and writes nothing; dry run writes nothing', async () => {
  const before = exportBundle();
  const bad = JSON.parse(JSON.stringify(before));
  bad.settings.home_title_main = 'must not be written';
  bad.algorithms.main = 'module.exports = function(){ for(;;){} }';
  bad.styles['x.y'] = { font_family: 'serif', font_size: 11 };
  bad.settings.secret = 'x';
  await assert.rejects(importBundle(bad), (e) => /nothing was changed/.test(e.message) && e.details.length >= 3);
  assert.equal(exportBundle().settings.home_title_main, before.settings.home_title_main);
  const ok = JSON.parse(JSON.stringify(before)); ok.settings.home_title_main = 'dry';
  await importBundle(ok, { dryRun: true });
  assert.equal(exportBundle().settings.home_title_main, before.settings.home_title_main);
  await assert.rejects(importBundle({ format: 'x', version: 2 }), /Not a tarot-content bundle/);
});

test('rich text is sanitized and a replaced algorithm keeps its previous version', async () => {
  const b = exportBundle();
  b.rich.privacy.en = '<p>ok</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>';
  b.algorithms.zodiac += '\n// edit';
  await importBundle(b);
  const html = db.prepare("SELECT en_html FROM rich_texts WHERE key = 'privacy'").get().en_html;
  assert.ok(!/script|javascript:/i.test(html));
  assert.ok(db.prepare("SELECT previous_code FROM algorithms WHERE id = 'zodiac'").get().previous_code);
});

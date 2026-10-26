'use strict';
// Arcana texts: per arcana a text for male and female, in 7 sections, in Bulgarian and English.
// A reading shows, for each of its 7 positions, the text of the arcana found there for the person's gender.
const os = require('os');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tarot-sections-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOADS_DIR = path.join(tmp, 'uploads');

// A database made by an earlier version (no sections column) is upgraded in place.
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
{
  const Database = require('better-sqlite3');
  const old = new Database(path.join(process.env.DATA_DIR, 'tarot.db'));
  old.exec(`CREATE TABLE arcana (number INTEGER PRIMARY KEY, name_bg TEXT NOT NULL, name_en TEXT NOT NULL,
    image_path TEXT, bg_text TEXT NOT NULL DEFAULT '', en_text TEXT NOT NULL DEFAULT '');
    INSERT INTO arcana (number, name_bg, name_en, bg_text) VALUES (99, 'Стар', 'Old', 'стар текст');`);
  old.close();
}

const { db } = require('../server/db');
const { seedIfEmpty } = require('../server/seed');
const { createPublicApp } = require('../server/publicApp');
const { importBundle, exportBundle } = require('../server/contentBundle');
const { SECTION_KEYS } = require('../server/arcanaTexts');
const { buildAnalysis } = require('../server/analysis');

let srv, P;
test.before(async () => {
  await seedIfEmpty();
  await new Promise((r) => { srv = createPublicApp().listen(0, r); });
  P = 'http://127.0.0.1:' + srv.address().port;
});
test.after(() => { srv.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const analyze = async (date, gender) => (await fetch(P + '/api/analyze', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ date, gender })
})).json();

// 31.12.1999: A=22(Fool), C=12, E=1999->28->10, ... ask the algorithm instead of hard-coding the positions
async function positions(day, month, year) {
  const a = await buildAnalysis({ day, month, year, gender: 'male' }, { debug: true });
  return a.debug.main.arcana; // [A, C, E, e2, G, I, x2] as arcana numbers
}
const texts = (tag) => Object.fromEntries(['male', 'female'].map((g) => [g, Object.fromEntries(SECTION_KEYS.map((k) => [k, { bg: `${tag} ${g} ${k} бг`, en: `${tag} ${g} ${k} en` }]))]));

test('an older database is upgraded without losing its rows', () => {
  const cols = db.prepare('PRAGMA table_info(arcana)').all().map((c) => c.name);
  assert.ok(cols.includes('sections_json'));
  assert.equal(db.prepare('SELECT bg_text FROM arcana WHERE number = 99').get().bg_text, 'стар текст');
});

test('every position shows its own section of the arcana found there, for the right gender', async () => {
  const pos = await positions(15, 6, 1990);
  const b = exportBundle();
  for (const n of new Set(pos)) b.arcana[n].texts = texts('a' + n);
  await importBundle(b);

  for (const gender of ['male', 'female']) {
    const a = await analyze('15.06.1990', gender);
    assert.equal(a.arcana.length, 7);
    a.arcana.forEach((blk, i) => {
      assert.equal(blk.number, pos[i]);
      assert.equal(blk.bg_text, `a${pos[i]} ${gender} ${SECTION_KEYS[i]} бг`);
      assert.equal(blk.en_text, `a${pos[i]} ${gender} ${SECTION_KEYS[i]} en`);
    });
  }
});

test('the same arcana at two positions gives two different texts (no merging, no skipping)', async () => {
  // 11.11.1111 is not allowed, so look for any date where an arcana repeats
  let found = null;
  for (let d = 1; d <= 28 && !found; d++) for (let m = 1; m <= 12 && !found; m++) {
    const pos = await positions(d, m, 1985);
    if (new Set(pos).size < 7) found = { d, m, pos };
  }
  assert.ok(found, 'a repeating date exists');
  const full = exportBundle();
  for (let n = 0; n < 22; n++) full.arcana[n].texts = texts('a' + n);
  await importBundle(full);
  const a = await analyze(`${String(found.d).padStart(2, '0')}.${String(found.m).padStart(2, '0')}.1985`, 'female');
  assert.equal(a.arcana.length, 7);
  const repeated = found.pos.find((n, i) => found.pos.indexOf(n) !== i);
  const blocks = a.arcana.filter((x) => x.number === repeated);
  assert.ok(blocks.length >= 2);
  assert.equal(new Set(blocks.map((x) => x.bg_text)).size, blocks.length);
});

test('public analysis exposes titles and texts but no section keys', async () => {
  const a = await analyze('15.06.1990', 'female');
  assert.deepEqual(Object.keys(a.arcana[0]).sort(), ['bg_text', 'en_text', 'image', 'name_bg', 'name_en', 'number', 'title_bg', 'title_en']);
  assert.equal(a.arcana[0].title_bg, 'Визитка');
  assert.equal(a.arcana[3].title_en, 'Money Block');
});

test('section titles can be changed through the bundle', async () => {
  const b = exportBundle();
  b.settings.section_titles.A = ['Лице', 'Face'];
  await importBundle(b);
  assert.equal((await analyze('15.06.1990', 'male')).arcana[0].title_en, 'Face');
});

test('export holds the texts, a round trip keeps them, and missing leaves are left alone', async () => {
  const pos = await positions(15, 6, 1990);
  const n = pos[0];
  const b = exportBundle();
  assert.equal(b.arcana[n].texts.female.A.en, `a${n} female A en`);
  // a bundle that only carries one leaf changes just that leaf
  const small = { format: b.format, version: b.version, arcana: { [n]: { texts: { female: { A: { en: 'only this' } } } } } };
  await importBundle(small);
  const after = exportBundle().arcana[n].texts;
  assert.equal(after.female.A.en, 'only this');
  assert.equal(after.female.A.bg, `a${n} female A бг`);
  assert.equal(after.male.A.en, `a${n} male A en`);
});

test('a bundle written by the previous version (bg_text/en_text per arcana) is still accepted and changes nothing', async () => {
  const b = exportBundle();
  const before = JSON.stringify(b.arcana);
  for (const v of Object.values(b.arcana)) { delete v.texts; v.bg_text = 'x'; v.en_text = 'y'; }
  await importBundle(b);
  assert.equal(JSON.stringify(exportBundle().arcana), before);
});

test('bad texts reject the whole bundle and name the exact place', async () => {
  const b = exportBundle();
  b.settings.home_title_main = 'Не трябва да се запише';
  b.arcana[2].texts = { female: { A: { bg: 5 }, Z: { bg: 'x', en: 'y' } }, other: {} };
  await assert.rejects(importBundle(b), (e) => {
    assert.match(e.message, /nothing was changed/);
    const t = e.details.join('\n');
    for (const needle of ['arcana.2.texts.female.A.bg', 'arcana.2.texts.female.Z', 'arcana.2.texts.other']) assert.ok(t.includes(needle), needle + '\n' + t);
    return true;
  });
  assert.notEqual(exportBundle().settings.home_title_main, 'Не трябва да се запише');
});

test('PDF still builds with the new blocks', async () => {
  const res = await fetch(P + '/api/analyze/pdf', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ date: '15.06.1990', gender: 'female' }) });
  assert.equal(res.status, 200);
  assert.equal(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
});

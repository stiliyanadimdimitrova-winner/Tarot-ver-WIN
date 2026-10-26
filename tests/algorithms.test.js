'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

// Isolated temp storage so tests never touch real data.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tarot-test-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOADS_DIR = path.join(tmp, 'uploads');

const { seedIfEmpty } = require('../server/seed');
const { runAlgorithm } = require('../server/algoService');
const { buildAnalysis } = require('../server/analysis');
const { parseDate } = require('../server/dates');
const { db } = require('../server/db');

const run = (id, d, m, y, gender) => runAlgorithm(id, { day: d, month: m, year: y, gender });

test.before(async () => { await seedIfEmpty(); });
test.after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

// ---------- zodiac ----------
test('zodiac: element boundaries (inclusive) and year wrap', async () => {
  const cases = [
    [21, 3, 'fire'], [19, 4, 'fire'], [20, 4, 'earth'], [20, 5, 'earth'], [21, 5, 'air'], [20, 6, 'air'],
    [21, 6, 'water'], [22, 7, 'water'], [23, 7, 'fire'], [22, 8, 'fire'], [23, 8, 'earth'], [22, 9, 'earth'],
    [23, 9, 'air'], [22, 10, 'air'], [23, 10, 'water'], [21, 11, 'water'], [22, 11, 'fire'], [21, 12, 'fire'],
    [22, 12, 'earth'], [31, 12, 'earth'], [1, 1, 'earth'], [19, 1, 'earth'], [20, 1, 'air'], [18, 2, 'air'],
    [19, 2, 'water'], [20, 3, 'water']
  ];
  for (const [d, m, el] of cases) {
    const r = await run('zodiac', d, m, 1990, 'female');
    assert.equal(r.element, el, `${d}/${m}`);
  }
});

test('zodiac: queen for female, king for male', async () => {
  assert.equal((await run('zodiac', 15, 6, 1990, 'female')).cardSlug, 'queen_air');
  assert.equal((await run('zodiac', 22, 12, 1990, 'male')).cardSlug, 'king_earth');
});

// ---------- main (hand-computed) ----------
const MAIN_CASES = [
  // [d, m, y, {A,C,E,G,I,e2,x2}, arcana order A,C,E,e2,G,I,x2 (22 -> 0)]
  [15, 6, 1990, { A: 15, C: 6, E: 19, G: 4, I: 8, e2: 9, x2: 3 }, [15, 6, 19, 9, 4, 8, 3]],
  [29, 2, 2000, { A: 11, C: 2, E: 2, G: 15, I: 3, e2: 5, x2: 10 }, [11, 2, 2, 5, 15, 3, 10]],
  [31, 12, 1999, { A: 4, C: 12, E: 10, G: 8, I: 7, e2: 17, x2: 22 }, [4, 12, 10, 17, 8, 7, 0]],
  [1, 1, 2001, { A: 1, C: 1, E: 3, G: 5, I: 10, e2: 13, x2: 5 }, [1, 1, 3, 13, 5, 10, 5]],
  [22, 11, 1985, { A: 22, C: 11, E: 5, G: 11, I: 13, e2: 18, x2: 6 }, [0, 11, 5, 18, 11, 13, 6]],
  [19, 9, 1975, { A: 19, C: 9, E: 22, G: 5, I: 10, e2: 5, x2: 7 }, [19, 9, 0, 5, 5, 10, 7]]
];
for (const [d, m, y, values, arcana] of MAIN_CASES) {
  test(`main: ${d}.${m}.${y}`, async () => {
    const r = await run('main', d, m, y, 'female');
    assert.deepEqual(r.values, values);
    assert.deepEqual(r.arcana, arcana);
    assert.equal(r.watermarkArcana, arcana[6]);
  });
}

test('main: every value is always within 1..22 for every day of several years', async () => {
  for (const y of [1900, 1984, 1999, 2000, 2024]) {
    for (let m = 1; m <= 12; m++) {
      for (const d of [1, 9, 10, 19, 28, 29, 30, 31]) {
        if (new Date(Date.UTC(y, m - 1, d)).getUTCMonth() !== m - 1) continue;
        const r = await run('main', d, m, y, 'male');
        for (const v of Object.values(r.values)) assert.ok(v >= 1 && v <= 22, `${d}.${m}.${y} -> ${v}`);
      }
    }
  }
});

// ---------- gua ----------
test('gua: worked example female 23.09.1985 -> 9', async () => {
  const r = await run('gua', 23, 9, 1985, 'female');
  assert.equal(r.gua, 9);
  assert.equal(r.group, 'east');
});
test('gua: male 23.09.1985 -> 6', async () => assert.equal((await run('gua', 23, 9, 1985, 'male')).gua, 6));
test('gua: before Li Chun uses previous year (female 03.02.1985 -> 8)', async () => {
  assert.equal((await run('gua', 3, 2, 1985, 'female')).gua, 8);
  assert.equal((await run('gua', 4, 2, 1985, 'female')).gua, 9); // 4 Feb is already the new year
});
test('gua: 2000s formulas', async () => {
  assert.equal((await run('gua', 15, 5, 2003, 'female')).gua, 9);
  assert.equal((await run('gua', 15, 5, 2003, 'male')).gua, 6);
});
test('gua: special case 5 (male -> 2, female -> 8)', async () => {
  assert.equal((await run('gua', 15, 5, 1986, 'male')).gua, 2);
  assert.equal((await run('gua', 15, 5, 1990, 'female')).gua, 8);
});
test('gua: never returns 5 and always has a table row', async () => {
  for (let y = 1900; y <= 2030; y++) {
    for (const g of ['male', 'female']) {
      const r = await run('gua', 15, 6, y, g);
      assert.ok(r.gua >= 1 && r.gua <= 9 && r.gua !== 5, `${y} ${g} -> ${r.gua}`);
    }
  }
});

// ---------- analysis privacy ----------
test('analysis: public result hides internal values and the Gua number', async () => {
  const a = await buildAnalysis({ day: 23, month: 9, year: 1985, gender: 'female' });
  const json = JSON.stringify(a);
  assert.ok(!('debug' in a));
  assert.ok(!/"gua"|"values"|"x2"|"e2"/.test(json));
  assert.equal(a.directions.success.en, 'East'); // gua 9 -> East
  assert.equal(a.directions.success.bg, 'Изток');
  assert.equal(a.directions.balance.en, 'South');
  // one block per position of the reading (7), even when the same arcana comes up twice
  assert.equal(a.arcana.length, 7);
  assert.deepEqual(a.arcana.map((x) => x.title_en), ['Image', 'Talent', 'Material Karma', 'Money Block', 'Past-Life Karma', 'Inner Strength', 'Ideal Profession']);
  assert.ok(a.arcana.every((x) => !('section' in x) && !('key' in x)));
});

// ---------- dates ----------
test('dates: validation', () => {
  assert.deepEqual(parseDate('29.02.2000'), { day: 29, month: 2, year: 2000 });
  assert.throws(() => parseDate('29.02.1900'), /invalid_date/); // 1900 is not a leap year
  assert.throws(() => parseDate('31.04.1990'), /invalid_date/);
  assert.throws(() => parseDate('01.01.2999'), /future_date/);
  assert.throws(() => parseDate('1.1.1800'), /year_out_of_range/);
  assert.throws(() => parseDate('abc'), /invalid_format/);
});

// ---------- sandbox ----------
test('sandbox: infinite loops, require and process access are stopped', async () => {
  const { runSandboxed } = require('../server/sandbox');
  await assert.rejects(runSandboxed('module.exports = function(){ while(true){} }', {}));
  await assert.rejects(runSandboxed('const fs = require("fs"); module.exports = function(){ return {} }', {}));
  await assert.rejects(runSandboxed('module.exports = function(){ return process.env }', {}));
  assert.deepEqual(await runSandboxed('module.exports = function(i){ return { n: i.a + 1 } }', { a: 1 }), { n: 2 });
});

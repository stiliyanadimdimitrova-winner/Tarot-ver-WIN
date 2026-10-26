'use strict';
const { db } = require('./db');
const { runSandboxed } = require('./sandbox');

const TEST_INPUTS = [
  { day: 15, month: 6, year: 1990, gender: 'female' },
  { day: 29, month: 2, year: 2000, gender: 'male' }
];

const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

// Shape validators: each throws a readable Error when the output does not match the contract.
const VALIDATORS = {
  zodiac(out) {
    if (!out || typeof out.cardSlug !== 'string') throw new Error('Output must be { element, cardSlug }');
    const row = db.prepare('SELECT 1 FROM zodiac_cards WHERE slug = ?').get(out.cardSlug);
    if (!row) throw new Error('Unknown cardSlug: ' + out.cardSlug);
  },
  main(out) {
    if (!out || !Array.isArray(out.arcana) || !out.arcana.length) throw new Error('Output must contain a non-empty "arcana" array');
    if (!out.arcana.every((n) => isInt(n, 0, 21))) throw new Error('"arcana" must contain integers from 0 to 21');
    if (!isInt(out.watermarkArcana, 0, 21)) throw new Error('"watermarkArcana" must be an integer from 0 to 21');
  },
  gua(out) {
    if (!out || !isInt(out.gua, 1, 9)) throw new Error('Output must contain "gua" as an integer from 1 to 9');
    if (!db.prepare('SELECT 1 FROM gua_table WHERE gua = ?').get(out.gua)) throw new Error('No gua_table row for gua ' + out.gua);
  }
};

function explain(e) {
  return String(e && e.message ? e.message : e).split('\n')[0];
}

async function runAlgorithm(id, input, codeOverride) {
  if (!VALIDATORS[id]) throw new Error('Unknown algorithm: ' + id);
  let code = codeOverride;
  if (code === undefined) {
    const row = db.prepare('SELECT code FROM algorithms WHERE id = ?').get(id);
    if (!row) throw new Error('Algorithm not found: ' + id);
    code = row.code;
  }
  let out;
  try {
    out = await runSandboxed(code, input);
  } catch (e) {
    throw new Error('Algorithm "' + id + '" failed: ' + explain(e));
  }
  try {
    VALIDATORS[id](out);
  } catch (e) {
    throw new Error('Algorithm "' + id + '" returned an invalid result: ' + explain(e));
  }
  return out;
}

module.exports = { runAlgorithm, TEST_INPUTS };

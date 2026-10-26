'use strict';
// Arcana texts: for every arcana a text per gender, per section, per language.
//   { male: { A: {bg, en}, C: {bg, en}, ... }, female: { ... } }
// The seven sections follow the order of the values the main algorithm returns (A, C, E, e2, G, I, x2),
// so position i of a reading uses section SECTION_KEYS[i] of the arcana found at that position.
const SECTION_KEYS = ['A', 'C', 'E', 'e2', 'G', 'I', 'x2'];
const GENDERS = ['male', 'female'];

const DEFAULT_SECTION_TITLES = {
  A: ['Визитка', 'Image'],
  C: ['Талант', 'Talent'],
  E: ['Материална карма', 'Material Karma'],
  e2: ['Блокаж на парите', 'Money Block'],
  G: ['Карма от предишен живот', 'Past-Life Karma'],
  I: ['Вътрешна сила', 'Inner Strength'],
  x2: ['Идеална професия', 'Ideal Profession']
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function emptyTexts() {
  const out = {};
  for (const g of GENDERS) {
    out[g] = {};
    for (const k of SECTION_KEYS) out[g][k] = { bg: '', en: '' };
  }
  return out;
}

// Reads the stored JSON; anything missing or malformed becomes empty text.
function parseTexts(json) {
  const out = emptyTexts();
  let raw = {};
  try { raw = JSON.parse(json || '{}'); } catch (e) { raw = {}; }
  if (!isObj(raw)) return out;
  for (const g of GENDERS) for (const k of SECTION_KEYS) {
    const leaf = isObj(raw[g]) && isObj(raw[g][k]) ? raw[g][k] : {};
    if (typeof leaf.bg === 'string') out[g][k].bg = leaf.bg;
    if (typeof leaf.en === 'string') out[g][k].en = leaf.en;
  }
  return out;
}

// Checks an incoming `texts` object. Returns a list of problems (empty when fine).
// Only gender / section / language keys that are known are accepted; every leaf must be text.
function validateTexts(v) {
  if (!isObj(v)) return ['must be an object like { male: { A: { bg, en } } }'];
  const errors = [];
  for (const [g, secs] of Object.entries(v)) {
    if (!GENDERS.includes(g)) { errors.push(`${g}: unknown gender (use male or female)`); continue; }
    if (!isObj(secs)) { errors.push(`${g}: must be an object`); continue; }
    for (const [k, leaf] of Object.entries(secs)) {
      if (!SECTION_KEYS.includes(k)) { errors.push(`${g}.${k}: unknown section (use ${SECTION_KEYS.join(', ')})`); continue; }
      if (!isObj(leaf)) { errors.push(`${g}.${k}: must be { bg, en }`); continue; }
      for (const [l, t] of Object.entries(leaf)) {
        if (l !== 'bg' && l !== 'en') errors.push(`${g}.${k}.${l}: unknown language (use bg or en)`);
        else if (typeof t !== 'string') errors.push(`${g}.${k}.${l}: must be text`);
      }
    }
  }
  return errors;
}

// Leaves present in `incoming` replace the stored ones; everything else stays as it was.
function mergeTexts(current, incoming) {
  const out = JSON.parse(JSON.stringify(current));
  for (const [g, secs] of Object.entries(incoming)) for (const [k, leaf] of Object.entries(secs)) {
    for (const l of ['bg', 'en']) if (typeof leaf[l] === 'string') out[g][k][l] = leaf[l];
  }
  return out;
}

// The text shown for one position of a reading.
function textFor(texts, gender, sectionKey) {
  const g = gender === 'female' ? 'female' : 'male';
  return texts[g][sectionKey];
}

module.exports = { SECTION_KEYS, GENDERS, DEFAULT_SECTION_TITLES, emptyTexts, parseTexts, validateTexts, mergeTexts, textFor };

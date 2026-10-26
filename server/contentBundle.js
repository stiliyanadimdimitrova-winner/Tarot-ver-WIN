'use strict';
// Content bundle: one JSON file with every editable text, style, image, algorithm and table.
// Written by the stand-alone editor (or by `export`), read by `import`. All input is validated;
// nothing is written unless the whole bundle passes.
const fs = require('fs');
const path = require('path');
const { db, getSetting, setSetting } = require('./db');
const { UPLOADS } = require('./images');
const { sanitizeHtml } = require('./sanitize');
const { runAlgorithm, TEST_INPUTS } = require('./algoService');
const { inspectImage, saveImageBuffer, removeUpload } = require('./imageStore');
const { SECTION_KEYS, DEFAULT_SECTION_TITLES, parseTexts, validateTexts, mergeTexts } = require('./arcanaTexts');

const FORMAT = 'tarot-content';
const VERSION = 2;
const TEXT_SETTINGS = [
  'home_title_main', 'home_title_sub', 'hologram_text_bg', 'hologram_text_en',
  'cover_title_en', 'cover_sub_en', 'cover_title_bg', 'cover_sub_bg',
  'directions_title_bg', 'directions_title_en', 'cover_text_color', 'body_text_color'
];
const IMAGE_SETTINGS = ['hero_bg', 'a4_cover', 'a4_template', 'wheel_watermark'];
const DIR_KEYS = ['success', 'health', 'love', 'balance'];
const GUA_FIELDS = DIR_KEYS.flatMap((k) => [k + '_bg', k + '_en']);
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

function toDataUri(urlPath) {
  if (!urlPath || urlPath.startsWith('/uploads/defaults/')) return null; // placeholders are not exported
  const file = path.join(UPLOADS, path.basename(urlPath));
  if (!fs.existsSync(file)) return null;
  const mime = MIME[path.extname(file).toLowerCase()];
  return mime ? `data:${mime};base64,${fs.readFileSync(file).toString('base64')}` : null;
}

function exportBundle() {
  const settings = {};
  for (const k of TEXT_SETTINGS) settings[k] = getSetting(k, '');
  settings.dir_labels = getSetting('dir_labels');
  settings.section_titles = getSetting('section_titles') || DEFAULT_SECTION_TITLES;
  const images = {};
  for (const k of IMAGE_SETTINGS) images[k] = toDataUri(getSetting(k));
  const rich = {};
  for (const r of db.prepare('SELECT * FROM rich_texts').all()) rich[r.key] = { bg: r.bg_html, en: r.en_html };
  const styles = {};
  for (const r of db.prepare('SELECT * FROM text_styles').all()) styles[r.field_key] = { font_family: r.font_family, font_size: r.font_size, bold: !!r.bold };
  const algorithms = {};
  for (const r of db.prepare('SELECT id, code FROM algorithms').all()) algorithms[r.id] = r.code;
  const zodiac = {};
  for (const r of db.prepare('SELECT * FROM zodiac_cards').all()) zodiac[r.slug] = { bg_text: r.bg_text, en_text: r.en_text, image: toDataUri(r.image_path) };
  const arcana = {};
  for (const r of db.prepare('SELECT * FROM arcana ORDER BY number').all()) arcana[r.number] = { image: toDataUri(r.image_path), texts: parseTexts(r.sections_json) };
  const gua = db.prepare('SELECT * FROM gua_table ORDER BY gua').all().map((r) => ({ gua: r.gua, grp: r.grp, ...Object.fromEntries(GUA_FIELDS.map((f) => [f, r[f]])) }));
  return { format: FORMAT, version: VERSION, exported_at: new Date().toISOString(), settings, images, rich, styles, algorithms, zodiac, arcana, gua };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';

function decodeDataUri(uri) {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(uri));
  if (!m) throw new Error('image must be a png, jpeg or webp data URI');
  return Buffer.from(m[2], 'base64');
}

// Validates the whole bundle, then writes it in one go. With dryRun nothing is written.
async function importBundle(b, { dryRun = false } = {}) {
  if (!isObj(b) || b.format !== FORMAT || b.version !== VERSION) throw new Error(`Not a ${FORMAT} bundle (version ${VERSION})`);
  const errors = [];
  const fail = (where, msg) => errors.push(`${where}: ${msg}`);
  const writes = [];        // synchronous DB writes, run in one transaction
  const newFiles = [];      // files created by this import (removed again if something fails)
  const oldFiles = [];      // replaced uploads (removed after success)
  const counts = {};
  const bump = (k) => { counts[k] = (counts[k] || 0) + 1; };

  async function prepareImage(where, uri, currentPath, apply, maxWidth) {
    if (uri === null || uri === undefined) return; // keep what the site has now
    try {
      const buf = decodeDataUri(uri);
      if (dryRun) { await inspectImage(buf); }
      else { const p = await saveImageBuffer(buf, { maxWidth }); newFiles.push(p); writes.push(() => apply(p)); oldFiles.push(currentPath); }
      bump('images');
    } catch (e) { fail(where, e.message); }
  }

  try {
    // settings
    if (b.settings !== undefined) {
      if (!isObj(b.settings)) fail('settings', 'must be an object');
      else for (const [k, v] of Object.entries(b.settings)) {
        if (TEXT_SETTINGS.includes(k)) {
          if (!isStr(v)) fail('settings.' + k, 'must be text');
          else if (/color$/.test(k) && !/^#[0-9a-fA-F]{6}$/.test(v)) fail('settings.' + k, 'invalid colour');
          else { writes.push(() => setSetting(k, v)); bump('settings'); }
        } else if (k === 'dir_labels') {
          const ok = isObj(v) && DIR_KEYS.every((d) => Array.isArray(v[d]) && v[d].length === 2 && v[d].every(isStr));
          if (!ok) fail('settings.dir_labels', 'needs success, health, love, balance as [bg, en]');
          else { writes.push(() => setSetting('dir_labels', Object.fromEntries(DIR_KEYS.map((d) => [d, v[d]])))); bump('settings'); }
        } else if (k === 'section_titles') {
          const ok = isObj(v) && SECTION_KEYS.every((d) => Array.isArray(v[d]) && v[d].length === 2 && v[d].every(isStr));
          if (!ok) fail('settings.section_titles', 'needs ' + SECTION_KEYS.join(', ') + ' as [bg, en]');
          else { writes.push(() => setSetting('section_titles', Object.fromEntries(SECTION_KEYS.map((d) => [d, v[d]])))); bump('settings'); }
        } else fail('settings.' + k, 'unknown setting');
      }
    }
    // images of the general settings
    if (b.images !== undefined) {
      if (!isObj(b.images)) fail('images', 'must be an object');
      else for (const [k, uri] of Object.entries(b.images)) {
        if (!IMAGE_SETTINGS.includes(k)) { fail('images.' + k, 'unknown image'); continue; }
        await prepareImage('images.' + k, uri, getSetting(k), (p) => setSetting(k, p), 4000);
      }
    }
    // rich texts
    if (b.rich !== undefined) {
      if (!isObj(b.rich)) fail('rich', 'must be an object');
      else for (const [k, v] of Object.entries(b.rich)) {
        if (!['intro', 'privacy'].includes(k)) fail('rich.' + k, 'unknown text');
        else if (!isObj(v) || !isStr(v.bg) || !isStr(v.en)) fail('rich.' + k, 'needs bg and en text');
        else { const bg = sanitizeHtml(v.bg), en = sanitizeHtml(v.en); writes.push(() => db.prepare('UPDATE rich_texts SET bg_html = ?, en_html = ? WHERE key = ?').run(bg, en, k)); bump('rich'); }
      }
    }
    // text styles
    if (b.styles !== undefined) {
      if (!isObj(b.styles)) fail('styles', 'must be an object');
      else for (const [k, s] of Object.entries(b.styles)) {
        const size = Math.round(Number(isObj(s) ? s.font_size : NaN));
        if (!/^(zodiac\.[a-z_]+\.(bg|en)|arcana\.\d+\.(bg|en)|directions)$/.test(k)) fail('styles.' + k, 'unknown field');
        else if (!(size >= 6 && size <= 40)) fail('styles.' + k, 'font size must be 6-40');
        else {
          const fam = s.font_family === 'sans' ? 'sans' : 'serif';
          writes.push(() => db.prepare(`INSERT INTO text_styles (field_key, font_family, font_size, bold) VALUES (?, ?, ?, ?)
            ON CONFLICT(field_key) DO UPDATE SET font_family = excluded.font_family, font_size = excluded.font_size, bold = excluded.bold`).run(k, fam, size, s.bold ? 1 : 0));
          bump('styles');
        }
      }
    }
    // cards
    for (const [section, table, keyCol, exists] of [
      ['zodiac', 'zodiac_cards', 'slug', (k) => db.prepare('SELECT image_path FROM zodiac_cards WHERE slug = ?').get(k)],
      ['arcana', 'arcana', 'number', (k) => /^\d+$/.test(k) ? db.prepare('SELECT image_path, sections_json FROM arcana WHERE number = ?').get(Number(k)) : undefined]
    ]) {
      if (b[section] === undefined) continue;
      if (!isObj(b[section])) { fail(section, 'must be an object'); continue; }
      for (const [k, v] of Object.entries(b[section])) {
        const cur = exists(k);
        if (!cur) { fail(`${section}.${k}`, 'unknown card'); continue; }
        const key = section === 'arcana' ? Number(k) : k;
        if (section === 'zodiac') {
          if (!isObj(v) || !isStr(v.bg_text) || !isStr(v.en_text)) { fail(`${section}.${k}`, 'needs bg_text and en_text'); continue; }
          writes.push(() => db.prepare('UPDATE zodiac_cards SET bg_text = ?, en_text = ? WHERE slug = ?').run(v.bg_text, v.en_text, key));
        } else {
          // Arcana: texts per gender -> section -> language. Leaves that are present replace the stored
          // ones, leaves that are missing keep what the site has.
          if (!isObj(v)) { fail(`${section}.${k}`, 'must be an object'); continue; }
          if (v.texts !== undefined) {
            const problems = validateTexts(v.texts);
            if (problems.length) { for (const p of problems) fail(`${section}.${k}.texts.${p.split(':')[0]}`, p.slice(p.indexOf(':') + 2)); continue; }
            const merged = JSON.stringify(mergeTexts(parseTexts(cur.sections_json), v.texts));
            writes.push(() => db.prepare('UPDATE arcana SET sections_json = ? WHERE number = ?').run(merged, key));
          }
        }
        bump(section);
        await prepareImage(`${section}.${k}.image`, v.image, cur.image_path, (p) => db.prepare(`UPDATE ${table} SET image_path = ? WHERE ${keyCol} = ?`).run(p, key), 2000);
      }
    }
    // Gua table
    if (b.gua !== undefined) {
      if (!Array.isArray(b.gua)) fail('gua', 'must be a list');
      else for (const r of b.gua) {
        if (!isObj(r) || !db.prepare('SELECT 1 FROM gua_table WHERE gua = ?').get(Number(r.gua))) { fail('gua', 'unknown row ' + (r && r.gua)); continue; }
        if (!['east', 'west'].includes(r.grp) || !GUA_FIELDS.every((f) => isStr(r[f]))) { fail('gua.' + r.gua, 'needs grp (east/west) and all direction texts'); continue; }
        writes.push(() => db.prepare(`UPDATE gua_table SET grp = ?, ${GUA_FIELDS.map((f) => f + ' = ?').join(', ')} WHERE gua = ?`).run(r.grp, ...GUA_FIELDS.map((f) => r[f]), Number(r.gua)));
        bump('gua');
      }
    }
    // algorithms: must run in the sandbox and return the expected shape for every test input
    if (b.algorithms !== undefined) {
      if (!isObj(b.algorithms)) fail('algorithms', 'must be an object');
      else for (const [id, code] of Object.entries(b.algorithms)) {
        if (!['zodiac', 'main', 'gua'].includes(id)) { fail('algorithms.' + id, 'unknown algorithm'); continue; }
        if (!isStr(code) || !code.trim()) { fail('algorithms.' + id, 'code is empty'); continue; }
        try {
          for (const input of TEST_INPUTS) await runAlgorithm(id, input, code);
          writes.push(() => {
            const cur = db.prepare('SELECT code FROM algorithms WHERE id = ?').get(id);
            if (cur && cur.code !== code) db.prepare('UPDATE algorithms SET previous_code = ?, code = ?, updated_at = ? WHERE id = ?').run(cur.code, code, new Date().toISOString(), id);
          });
          bump('algorithms');
        } catch (e) { fail('algorithms.' + id, e.message); }
      }
    }

    if (errors.length) throw Object.assign(new Error('Bundle rejected, nothing was changed'), { details: errors });
    if (!dryRun) {
      db.transaction(() => { for (const w of writes) w(); })();
      for (const p of oldFiles) removeUpload(p);
    }
    return { dryRun, counts };
  } catch (e) {
    for (const p of newFiles) removeUpload(p);
    throw e;
  }
}

module.exports = { exportBundle, importBundle, FORMAT, VERSION };

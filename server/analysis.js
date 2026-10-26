'use strict';
const { db, getSetting } = require('./db');
const { runAlgorithm } = require('./algoService');
const { SECTION_KEYS, DEFAULT_SECTION_TITLES, parseTexts, textFor } = require('./arcanaTexts');

function stylesMap() {
  const out = {};
  for (const r of db.prepare('SELECT * FROM text_styles').all()) {
    out[r.field_key] = { font_family: r.font_family, font_size: r.font_size, bold: !!r.bold };
  }
  return out;
}

// Builds the analysis for one person. The returned object is safe to send to the public site:
// it never contains the intermediate values (A, C, E, e2, G, I, x2) or the Gua number.
// With { debug: true } the raw algorithm outputs are included as well (for local previews).
async function buildAnalysis(input, { debug = false } = {}) {
  const [zod, main, gua] = await Promise.all([
    runAlgorithm('zodiac', input),
    runAlgorithm('main', input),
    runAlgorithm('gua', input)
  ]);

  const card = db.prepare('SELECT * FROM zodiac_cards WHERE slug = ?').get(zod.cardSlug);
  const titles = getSetting('section_titles') || DEFAULT_SECTION_TITLES;

  // One block per position of the reading (A, C, E, e2, G, I, x2), in the order of the main algorithm.
  // The same arcana may come up at several positions; each position has its own text.
  const arcanaRows = main.arcana.map((n) => db.prepare('SELECT * FROM arcana WHERE number = ?').get(n));
  const watermark = db.prepare('SELECT image_path FROM arcana WHERE number = ?').get(main.watermarkArcana);

  const g = db.prepare('SELECT * FROM gua_table WHERE gua = ?').get(gua.gua);
  const directions = {};
  for (const k of ['success', 'health', 'love', 'balance']) {
    directions[k] = { bg: g[k + '_bg'], en: g[k + '_en'] };
  }

  const result = {
    zodiac: {
      slug: card.slug, name_bg: card.name_bg, name_en: card.name_en,
      image: card.image_path, bg_text: card.bg_text, en_text: card.en_text
    },
    // Each position shows the arcana's text for the person's gender in the section of that position.
    // Section keys (A, C, ...) stay on the server; the page only gets the visible titles.
    arcana: arcanaRows.map((a, i) => {
      const sec = SECTION_KEYS[i];
      const t = textFor(parseTexts(a.sections_json), input.gender, sec);
      const title = titles[sec] || DEFAULT_SECTION_TITLES[sec];
      return {
        number: a.number, name_bg: a.name_bg, name_en: a.name_en, image: a.image_path,
        title_bg: title[0], title_en: title[1], bg_text: t.bg, en_text: t.en
      };
    }),
    watermarkImage: watermark ? watermark.image_path : null,
    directions,
    directionsTitle: { bg: getSetting('directions_title_bg'), en: getSetting('directions_title_en') },
    directionLabels: getSetting('dir_labels'),
    cover: {
      title_en: getSetting('cover_title_en'), sub_en: getSetting('cover_sub_en'),
      title_bg: getSetting('cover_title_bg'), sub_bg: getSetting('cover_sub_bg')
    },
    templates: { cover: getSetting('a4_cover'), page: getSetting('a4_template'), wheel: getSetting('wheel_watermark') },
    colors: { cover: getSetting('cover_text_color', '#f0e4bd'), body: getSetting('body_text_color', '#f0e4bd') },
    styles: stylesMap()
  };
  if (debug) result.debug = { zodiac: zod, main, gua: { ...gua, group: g.grp } };
  return result;
}

module.exports = { buildAnalysis, stylesMap };

'use strict';
const fs = require('fs');
const path = require('path');
const { db, ROOT, getSetting, setSetting } = require('./db');
const { makePlaceholder } = require('./images');
const { DEFAULT_SECTION_TITLES } = require('./arcanaTexts');

const ARCANA = [
  ['Глупакът', 'The Fool'], ['Магьосникът', 'The Magician'], ['Висшата жрица', 'The High Priestess'],
  ['Императрицата', 'The Empress'], ['Императорът', 'The Emperor'], ['Жрецът', 'The Hierophant'],
  ['Влюбените', 'The Lovers'], ['Колесницата', 'The Chariot'], ['Силата', 'Strength'],
  ['Отшелникът', 'The Hermit'], ['Колелото на съдбата', 'Wheel of Fortune'], ['Справедливостта', 'Justice'],
  ['Обесеният', 'The Hanged Man'], ['Смъртта', 'Death'], ['Умереността', 'Temperance'],
  ['Дяволът', 'The Devil'], ['Кулата', 'The Tower'], ['Звездата', 'The Star'], ['Луната', 'The Moon'],
  ['Слънцето', 'The Sun'], ['Страшният съд', 'Judgement'], ['Светът', 'The World']
];
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];

const D = {
  N: ['Север', 'North'], NE: ['Североизток', 'Northeast'], E: ['Изток', 'East'], SE: ['Югоизток', 'Southeast'],
  S: ['Юг', 'South'], SW: ['Югозапад', 'Southwest'], W: ['Запад', 'West'], NW: ['Северозапад', 'Northwest']
};
// gua: [group, success, health, love, balance]
const GUA = {
  1: ['east', 'SE', 'E', 'S', 'N'], 2: ['west', 'NE', 'W', 'NW', 'SW'], 3: ['east', 'S', 'N', 'SE', 'E'],
  4: ['east', 'N', 'S', 'E', 'SE'], 6: ['west', 'W', 'NE', 'SW', 'NW'], 7: ['west', 'NW', 'SW', 'NE', 'W'],
  8: ['west', 'SW', 'NW', 'W', 'NE'], 9: ['east', 'E', 'SE', 'N', 'S']
};

const ALGORITHMS = [
  ['zodiac', 'Алгоритъм 1: Зодии / Algorithm 1: Zodiac'],
  ['main', 'Алгоритъм 2: Основен / Algorithm 2: Main'],
  ['gua', 'Алгоритъм 3: Гуа / Algorithm 3: Gua']
];

const TEXT_DEFAULTS = {
  home_title_main: 'Bulgarian mythology tarot',
  home_title_sub: 'self-reflection',
  hologram_text_bg: 'Въведи датата си на раждане, избери пола и завърти колелото.',
  hologram_text_en: 'Enter your date of birth, choose your gender and spin the wheel.',
  cover_title_en: 'Self-reflection',
  cover_sub_en: 'Unique Tarot inspired by bulgarian mythology, symbolism and spirit.',
  cover_title_bg: 'Самопознание',
  cover_sub_bg: 'Таро аркани вдъхновени от българската митология, символика и дух.',
  cover_text_color: '#f0e4bd',
  body_text_color: '#f0e4bd',
  directions_title_bg: 'Благословени лични посоки',
  directions_title_en: 'Blessed Personal Directions',
  section_titles: DEFAULT_SECTION_TITLES,
  dir_labels: {
  success: ['Успех и развитие', 'Success and development'],
  health: ['Здраве и подкрепа', 'Health and support'],
  love: ['Любов и хармония', 'Love and harmony'],
  balance: ['Вътрешен баланс', 'Inner balance']
  }
};

async function seedIfEmpty({ reset = false } = {}) {
  if (reset) {
    for (const t of ['settings', 'rich_texts', 'text_styles', 'algorithms', 'zodiac_cards', 'arcana', 'gua_table']) {
      db.prepare(`DELETE FROM ${t}`).run();
    }
  }

  // ---- placeholder images  ----
  const hero = await makePlaceholder('hero-bg.png', 1600, 1000, 'hero-bg.png', 'Bulgarian mythology tarot');
  const cover = await makePlaceholder('A4cover.png', 1240, 1754, 'A4cover.png', 'placeholder');
  const tpl = await makePlaceholder('A4template.png', 1240, 1754, 'A4template.png', 'placeholder');
  const wheel = await makePlaceholder('wheel.png', 900, 260, 'Чекръкът на съдбата', 'placeholder');

  // ---- settings ----
  const defaults = { ...TEXT_DEFAULTS, hero_bg: hero, a4_cover: cover, a4_template: tpl, wheel_watermark: wheel };
  for (const [k, v] of Object.entries(defaults)) {
    if (getSetting(k) === null) setSetting(k, v);
  }

  // ---- rich texts ----
  const rt = db.prepare('INSERT OR IGNORE INTO rich_texts (key, bg_html, en_html) VALUES (?, ?, ?)');
  rt.run('intro', '<p>Добре дошли в Bulgarian mythology tarot. Тук се поставя уводният текст.</p>',
    '<p>Welcome to Bulgarian mythology tarot. The introduction goes here.</p>');
  rt.run('privacy', '<p>Политика за поверителност. Тук се поставя текстът.</p>',
    '<p>Privacy policy. The text goes here.</p>');

  // ---- algorithms ----
  const insAlgo = db.prepare('INSERT OR IGNORE INTO algorithms (id, name, code, previous_code, updated_at) VALUES (?, ?, ?, NULL, ?)');
  for (const [id, name] of ALGORITHMS) {
    insAlgo.run(id, name, fs.readFileSync(path.join(ROOT, 'server', 'algorithms', id + '.js'), 'utf8'), new Date().toISOString());
  }

  // ---- zodiac cards ----
  const zodiac = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'zodiac_seed.json'), 'utf8'));
  const insZ = db.prepare('INSERT OR IGNORE INTO zodiac_cards (slug, name_bg, name_en, image_path, bg_text, en_text) VALUES (?, ?, ?, ?, ?, ?)');
  for (const [slug, z] of Object.entries(zodiac)) {
    const img = await makePlaceholder(`zodiac_${slug}.png`, 600, 1000, z.name_en, z.name_bg);
    insZ.run(slug, z.name_bg, z.name_en, img, z.bg_text, z.en_text);
  }

  // ---- arcana (texts per gender and section come from tarot_astro_analysis_ok through the content file) ----
  const insA = db.prepare('INSERT OR IGNORE INTO arcana (number, name_bg, name_en, image_path, bg_text, en_text) VALUES (?, ?, ?, ?, \'\', \'\')');
  for (let n = 0; n < 22; n++) {
    const img = await makePlaceholder(`arcana_${n}.png`, 600, 1000, ROMAN[n], ARCANA[n][1]);
    insA.run(n, ARCANA[n][0], ARCANA[n][1], img);
  }

  // ---- gua table ----
  const insG = db.prepare(`INSERT OR IGNORE INTO gua_table
    (gua, grp, success_bg, success_en, health_bg, health_en, love_bg, love_en, balance_bg, balance_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const [g, [grp, s, h, l, b]] of Object.entries(GUA)) {
    insG.run(Number(g), grp, D[s][0], D[s][1], D[h][0], D[h][1], D[l][0], D[l][1], D[b][0], D[b][1]);
  }
}

module.exports = { seedIfEmpty, ARCANA, ROMAN, GUA, D, TEXT_DEFAULTS };

if (require.main === module) {
  if (fs.existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));
  const reset = process.argv.includes('--reset');
  seedIfEmpty({ reset }).then(() => {
    console.log('Seed complete' + (reset ? ' (database reset)' : ''));
  });
}

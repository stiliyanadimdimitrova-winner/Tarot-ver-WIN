'use strict';
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const { ROOT, getSetting } = require('./db');
const { UPLOADS } = require('./images');
const { ROMAN } = require('./seed');

const FONT_DIR = path.join(ROOT, 'assets', 'fonts');
const FONTS = {
  serif: { regular: path.join(FONT_DIR, 'DejaVuSerif.ttf'), bold: path.join(FONT_DIR, 'DejaVuSerif-Bold.ttf') },
  sans: { regular: path.join(FONT_DIR, 'DejaVuSans.ttf'), bold: path.join(FONT_DIR, 'DejaVuSans-Bold.ttf') }
};
const PAGE = { w: 595.28, h: 841.89 };
const MARGIN = { left: 62, right: 62, top: 70, bottom: 135 };

const imgCache = new Map();
// pdfkit only reads PNG/JPEG, so every image (including webp) is converted to a bounded PNG.
async function loadImage(urlPath, maxWidth = 1700) {
  if (!urlPath) return null;
  const rel = urlPath.replace(/^\/uploads\//, '');
  const file = path.join(UPLOADS, rel);
  if (!file.startsWith(UPLOADS) || !fs.existsSync(file)) return null;
  const key = file + ':' + fs.statSync(file).mtimeMs;
  if (!imgCache.has(key)) {
    imgCache.set(key, await sharp(file).resize({ width: maxWidth, withoutEnlargement: true }).png().toBuffer());
  }
  return imgCache.get(key);
}

function styleOf(styles, key, fallbackSize = 11) {
  const s = (styles && styles[key]) || {};
  return {
    family: FONTS[s.font_family] ? s.font_family : 'serif',
    size: s.font_size || fallbackSize,
    bold: !!s.bold
  };
}

// Returns a Buffer with the finished PDF: cover page, then analysis pages on the A4 template.
async function buildPdf(analysis) {
  const cover = await loadImage(analysis.templates.cover);
  const page = await loadImage(analysis.templates.page);
  const wheel = await loadImage(analysis.templates.wheel, 900);
  const mark = await loadImage(analysis.watermarkImage, 1100);
  const coverColor = getSetting('cover_text_color', '#f0e4bd');
  const bodyColor = getSetting('body_text_color', '#f0e4bd');

  const doc = new PDFDocument({ size: 'A4', autoFirstPage: false, margins: MARGIN,
    info: { Title: 'Self-reflection / Самопознание' } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  for (const f of Object.values(FONTS)) { /* fail early when a font file is missing */
    if (!fs.existsSync(f.regular) || !fs.existsSync(f.bold)) throw new Error('Font file missing in assets/fonts');
  }
  doc.registerFont('serif', FONTS.serif.regular);
  doc.registerFont('serif-bold', FONTS.serif.bold);
  doc.registerFont('sans', FONTS.sans.regular);
  doc.registerFont('sans-bold', FONTS.sans.bold);

  const font = (st) => st.family + (st.bold ? '-bold' : '');

  // ---- page 1: A4cover.png with only the four titles ----
  doc.addPage({ margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  doc.rect(0, 0, PAGE.w, PAGE.h).fill('#0d0818');
  if (cover) doc.image(cover, 0, 0, { width: PAGE.w, height: PAGE.h });
  const cw = PAGE.w - 140;
  const centered = (text, y, size, bold) => {
    doc.font(bold ? 'serif-bold' : 'serif').fontSize(size).fillColor(coverColor)
      .text(text, 70, y, { width: cw, align: 'center', lineGap: 4 });
  };
  centered(analysis.cover.title_en, 255, 38, true);
  centered(analysis.cover.sub_en, doc.y + 12, 13, false);
  centered(analysis.cover.title_bg, 470, 38, true);
  centered(analysis.cover.sub_bg, doc.y + 12, 13, false);

  // ---- following pages: template + watermarks, drawn on every new page ----
  const paintPage = () => {
    doc.rect(0, 0, PAGE.w, PAGE.h).fill('#0d0818');
    if (page) doc.image(page, 0, 0, { width: PAGE.w, height: PAGE.h });
    if (mark) {
      doc.save().opacity(0.13);
      const mw = 330;
      doc.image(mark, (PAGE.w - mw) / 2, (PAGE.h - mw * 1.6) / 2, { fit: [mw, mw * 1.6], align: 'center', valign: 'center' });
      doc.restore();
    }
    if (wheel) {
      doc.save().opacity(0.45);
      doc.image(wheel, (PAGE.w - 230) / 2, PAGE.h - 118, { fit: [230, 90], align: 'center', valign: 'center' });
      doc.restore();
    }
    doc.x = MARGIN.left;
    doc.y = MARGIN.top;
  };
  doc.on('pageAdded', () => { if (doc.__body) paintPage(); });
  doc.__body = true;
  doc.addPage({ margins: MARGIN });
  const width = PAGE.w - MARGIN.left - MARGIN.right;
  const limit = PAGE.h - MARGIN.bottom;

  const ensureRoom = (needed) => { if (doc.y + needed > limit) doc.addPage({ margins: MARGIN }); };
  const heading = (text) => {
    ensureRoom(120);
    doc.font('serif-bold').fontSize(15).fillColor(bodyColor).text(text, MARGIN.left, doc.y, { width, align: 'left' });
    doc.moveDown(0.4);
  };
  const paragraph = (text, st) => {
    if (!text || !text.trim()) return;
    ensureRoom(60);
    doc.font(font(st)).fontSize(st.size).fillColor(bodyColor)
      .text(text.trim(), MARGIN.left, doc.y, { width, align: 'justify', lineGap: 3 });
    doc.moveDown(0.8);
  };
  const styles = analysis.styles;

  // 1) zodiac
  const z = analysis.zodiac;
  heading(`${z.name_bg} · ${z.name_en}`);
  paragraph(z.bg_text, styleOf(styles, `zodiac.${z.slug}.bg`));
  paragraph(z.en_text, styleOf(styles, `zodiac.${z.slug}.en`));
  doc.moveDown(0.8);

  // 2) one block per position of the reading: section title, arcana name, then the text in both languages
  const small = (text) => {
    doc.font('serif').fontSize(10).fillColor(bodyColor).opacity(0.75)
      .text(text, MARGIN.left, doc.y, { width, align: 'left' }).opacity(1);
    doc.moveDown(0.4);
  };
  for (const a of analysis.arcana) {
    if (!(a.bg_text || '').trim() && !(a.en_text || '').trim()) continue;
    heading(`${a.title_bg} · ${a.title_en}`);
    small(`${ROMAN[a.number]}. ${a.name_bg} · ${a.name_en}`);
    paragraph(a.bg_text, styleOf(styles, `arcana.${a.number}.bg`));
    paragraph(a.en_text, styleOf(styles, `arcana.${a.number}.en`));
    doc.moveDown(0.6);
  }

  // 3) "Благословени лични посоки": only the four positive directions, no Gua number.
  const dst = styleOf(styles, 'directions', 12);
  ensureRoom(210);
  doc.moveDown(0.5);
  for (const lang of ['bg', 'en']) {
    heading(analysis.directionsTitle[lang]);
    for (const key of ['success', 'health', 'love', 'balance']) {
      const label = analysis.directionLabels[key][lang === 'bg' ? 0 : 1];
      doc.font(font(dst)).fontSize(dst.size).fillColor(bodyColor)
        .text(`${label}: ${analysis.directions[key][lang]}`, MARGIN.left, doc.y, { width, lineGap: 3 });
      doc.moveDown(0.3);
    }
    doc.moveDown(0.8);
  }

  doc.end();
  return done;
}

module.exports = { buildPdf };

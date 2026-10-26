'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { db, ROOT, getSetting } = require('./db');
const { UPLOADS } = require('./images');
const { sanitizeHtml } = require('./sanitize');
const { buildAnalysis } = require('./analysis');
const { buildPdf } = require('./pdf');
const { parseDate, parseGender } = require('./dates');

const PUBLIC_DIR = path.join(ROOT, 'public');

function readInput(body) {
  try {
    return { ...parseDate((body || {}).date), gender: parseGender((body || {}).gender) };
  } catch (e) {
    const err = new Error(e.message);
    err.status = 400;
    throw err;
  }
}

function createPublicApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:'], styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"], connectSrc: ["'self'"], fontSrc: ["'self'"], objectSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    }
  }));
  app.use(express.json({ limit: '10kb' }));
  app.use('/uploads', express.static(UPLOADS, { maxAge: '1h' }));
  app.get('/vendor/purify.min.js', (req, res) => res.sendFile(path.join(ROOT, 'node_modules', 'dompurify', 'dist', 'purify.min.js')));

  // ---- read-only content ----
  app.get('/api/public/config', (req, res) => {
    const rich = {};
    for (const r of db.prepare('SELECT * FROM rich_texts').all()) {
      rich[r.key] = { bg: sanitizeHtml(r.bg_html), en: sanitizeHtml(r.en_html) };
    }
    res.set('Cache-Control', 'no-store').json({
      title: { main: getSetting('home_title_main'), sub: getSetting('home_title_sub') },
      heroBg: getSetting('hero_bg'),
      hologram: { bg: getSetting('hologram_text_bg'), en: getSetting('hologram_text_en') },
      rich
    });
  });

  // ---- analysis: computed on the server only ----
  const limiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
  app.post('/api/analyze', limiter, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store').json(await buildAnalysis(readInput(req.body)));
    } catch (e) { next(e); }
  });
  app.post('/api/analyze/pdf', limiter, async (req, res, next) => {
    try {
      const pdf = await buildPdf(await buildAnalysis(readInput(req.body)));
      res.set('Cache-Control', 'no-store')
        .set('Content-Disposition', 'attachment; filename="self-reflection.pdf"')
        .type('application/pdf').send(pdf);
    } catch (e) { next(e); }
  });

  // ---- site ----
  app.get('/result', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'result.html')));
  app.use(express.static(PUBLIC_DIR));

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    const status = err.status || 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Server error' : err.message });
  });
  return app;
}

module.exports = { createPublicApp };

'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { ROOT } = require('./db');

const UPLOADS = process.env.UPLOADS_DIR || path.join(ROOT, 'uploads');
const DEFAULTS_DIR = path.join(UPLOADS, 'defaults');
fs.mkdirSync(DEFAULTS_DIR, { recursive: true });

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

async function makePlaceholder(file, width, height, label, sub) {
  const target = path.join(DEFAULTS_DIR, file);
  if (fs.existsSync(target)) return '/uploads/defaults/' + file;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs><radialGradient id="g" cx="50%" cy="40%" r="75%">
    <stop offset="0" stop-color="#3b2358"/><stop offset="0.6" stop-color="#1a1030"/><stop offset="1" stop-color="#08050f"/>
  </radialGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="${width * 0.04}" y="${height * 0.03}" width="${width * 0.92}" height="${height * 0.94}" fill="none" stroke="#c9a85c" stroke-opacity="0.5" stroke-width="${Math.max(2, width / 400)}"/>
  <text x="50%" y="50%" fill="#e9d8a6" fill-opacity="0.8" font-family="DejaVu Serif, serif" font-size="${Math.round(width / 12)}" text-anchor="middle">${esc(label)}</text>
  <text x="50%" y="${50 + 8}%" fill="#e9d8a6" fill-opacity="0.5" font-family="DejaVu Serif, serif" font-size="${Math.round(width / 26)}" text-anchor="middle">${esc(sub || 'placeholder')}</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(target);
  return '/uploads/defaults/' + file;
}

module.exports = { UPLOADS, makePlaceholder };

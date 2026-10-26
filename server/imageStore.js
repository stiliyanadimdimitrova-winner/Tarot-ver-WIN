'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { UPLOADS } = require('./images');

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = { png: 'png', jpeg: 'jpg', webp: 'webp' };

// Checks the real image type from the file content (not the extension or MIME header).
async function inspectImage(buffer) {
  if (!buffer || !buffer.length) throw new Error('Empty file');
  if (buffer.length > MAX_BYTES) throw new Error('File is larger than 10 MB');
  let meta;
  try { meta = await sharp(buffer).metadata(); } catch { throw new Error('Not a valid image'); }
  const ext = ALLOWED[meta.format];
  if (!ext) throw new Error('Only png, jpg and webp images are allowed');
  return { meta, ext };
}

// Validates, resizes very large images and stores them under a random file name.
async function saveImageBuffer(buffer, { maxWidth = 3000 } = {}) {
  const { meta, ext } = await inspectImage(buffer);
  let pipeline = sharp(buffer).rotate();
  if (meta.width && meta.width > maxWidth) pipeline = pipeline.resize({ width: maxWidth });
  const name = crypto.randomBytes(16).toString('hex') + '.' + ext;
  await pipeline.toFile(path.join(UPLOADS, name));
  return '/uploads/' + name;
}

// Deletes a stored upload (never the built-in placeholders).
function removeUpload(urlPath) {
  if (!urlPath || !urlPath.startsWith('/uploads/') || urlPath.startsWith('/uploads/defaults/')) return;
  fs.rmSync(path.join(UPLOADS, path.basename(urlPath)), { force: true });
}

module.exports = { inspectImage, saveImageBuffer, removeUpload };

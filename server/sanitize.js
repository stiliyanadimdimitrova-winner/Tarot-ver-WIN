'use strict';
const sanitizeHtml = require('sanitize-html');

const OPTIONS = {
  allowedTags: [...sanitizeHtml.defaults.allowedTags, 'h1', 'h2', 'h3', 'u', 's', 'span', 'img'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    '*': ['class', 'data-list'] // Quill alignment and list markers
  },
  allowedStyles: { '*': { 'text-align': [/^(left|right|center|justify)$/] } },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }) }
};

// Rich text (Intro / Privacy) is sanitized on save and again when served.
function sanitize(html) {
  return sanitizeHtml(String(html || ''), OPTIONS);
}

module.exports = { sanitizeHtml: sanitize };

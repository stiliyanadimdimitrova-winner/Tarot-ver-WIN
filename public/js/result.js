'use strict';
(function () {
  const T = window.Tarot;
  const $ = (id) => document.getElementById(id);
  const status = $('status'), sheets = $('sheets');
  let reading = null;
  try { reading = JSON.parse(sessionStorage.getItem('reading')); } catch (e) { /* none */ }
  if (!reading || !reading.date || !reading.gender) { location.replace('/'); return; }

  const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];
  const FAMILY = { serif: '"DejaVu Serif", Georgia, serif', sans: '"PT Sans", "DejaVu Sans", sans-serif' };

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const url = (p) => `url("${p}")`;

  function styled(node, styles, key, fallbackSize) {
    const s = styles[key] || {};
    node.style.fontFamily = FAMILY[s.font_family] || FAMILY.serif;
    node.style.fontSize = `calc(${(s.font_size || fallbackSize || 11) * 1.333}px * var(--k))`;
    node.style.fontWeight = s.bold ? '700' : '400';
    return node;
  }

  function render(a) {
    sheets.textContent = '';

    // page 1: cover (only the four titles)
    const cover = el('section', 'sheet cover');
    cover.style.backgroundImage = url(a.templates.cover);
    cover.style.setProperty('--sheet-text', a.colors.cover);
    for (const l of ['en', 'bg']) {
      const box = el('div', 'cover-text ' + l);
      box.append(el('h2', '', a.cover['title_' + l]), el('p', '', a.cover['sub_' + l]));
      cover.append(box);
    }
    sheets.append(cover);

    // analysis on the A4 template with watermarks
    const body = el('section', 'sheet body');
    body.style.backgroundImage = url(a.templates.page);
    body.style.setProperty('--sheet-text', a.colors.body);
    if (a.watermarkImage) body.style.setProperty('--mark', url(a.watermarkImage));
    body.style.setProperty('--wheel', url(a.templates.wheel));

    const block = (title, bg, en, keyBase) => {
      if (!(bg || '').trim() && !(en || '').trim()) return;
      body.append(el('h3', '', title));
      if ((bg || '').trim()) body.append(styled(el('p', '', bg.trim()), a.styles, keyBase + '.bg'));
      if ((en || '').trim()) body.append(styled(el('p', '', en.trim()), a.styles, keyBase + '.en'));
    };
    block(`${a.zodiac.name_bg} · ${a.zodiac.name_en}`, a.zodiac.bg_text, a.zodiac.en_text, `zodiac.${a.zodiac.slug}`);
    a.arcana.forEach((c) => {
      if (!(c.bg_text || '').trim() && !(c.en_text || '').trim()) return;
      body.append(el('h3', '', `${c.title_bg} · ${c.title_en}`));
      body.append(el('p', 'arcana-name', `${ROMAN[c.number]}. ${c.name_bg} · ${c.name_en}`));
      if ((c.bg_text || '').trim()) body.append(styled(el('p', '', c.bg_text.trim()), a.styles, `arcana.${c.number}.bg`));
      if ((c.en_text || '').trim()) body.append(styled(el('p', '', c.en_text.trim()), a.styles, `arcana.${c.number}.en`));
    });

    for (const l of ['bg', 'en']) {
      body.append(el('h3', '', a.directionsTitle[l]));
      ['success', 'health', 'love', 'balance'].forEach((k) => {
        const p = el('p', 'dir', `${a.directionLabels[k][l === 'bg' ? 0 : 1]}: ${a.directions[k][l]}`);
        body.append(styled(p, a.styles, 'directions', 12));
      });
    }
    sheets.append(body);
    scale();
    sheets.hidden = false;
  }

  // text sizes are defined in A4 points; scale them to the sheet width on small screens
  function scale() {
    const w = Math.min(794, document.documentElement.clientWidth - 20);
    document.querySelectorAll('.sheet').forEach((s) => s.style.setProperty('--k', String(w / 794)));
  }
  window.addEventListener('resize', scale);

  async function loadPdf() {
    const res = await T.api('/api/analyze/pdf', reading);
    return res.blob();
  }
  async function withButtons(fn) {
    const btns = document.querySelectorAll('.actions button');
    btns.forEach((b) => { b.disabled = true; });
    try { await fn(); } catch (e) { status.hidden = false; status.classList.add('is-error'); status.textContent = T.MESSAGES[T.getLang()].server; }
    btns.forEach((b) => { b.disabled = false; });
  }
  $('btn-pdf').addEventListener('click', () => withButtons(async () => {
    const blob = await loadPdf();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'self-reflection.pdf';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }));
  // Print: open the generated PDF in a new tab, where the browser's own print dialog handles it.
  $('btn-print').addEventListener('click', () => {
    const win = window.open('', '_blank');
    withButtons(async () => {
      const blob = await loadPdf();
      const u = URL.createObjectURL(blob);
      if (win) win.location.href = u; else window.print();
    });
  });

  T.api('/api/analyze', reading).then((r) => r.json()).then((a) => {
    status.hidden = true;
    render(a);
    document.querySelectorAll('.actions button').forEach((b) => { b.disabled = false; });
  }).catch((e) => {
    status.classList.add('is-error');
    const M = T.MESSAGES[T.getLang()];
    status.textContent = M[e.message] || M.server;
  });
})();

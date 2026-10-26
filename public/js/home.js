'use strict';
(function () {
  const T = window.Tarot;
  const $ = (id) => document.getElementById(id);
  const dob = $('dob'), spin = $('spin'), err = $('dob-error');
  let config = null, lang = T.getLang(), gender = null, holoCtl = null;

  // ---------- content from the API (nothing is hard-coded) ----------
  fetch('/api/public/config').then((r) => r.json()).then((c) => {
    config = c;
    $('t-main').textContent = c.title.main;
    $('t-sub').textContent = c.title.sub;
    document.title = c.title.main;
    $('bg').style.backgroundImage = `url("${c.heroBg}")`;
    startHologram();
  }).catch(() => { document.body.classList.remove('is-intro'); startHologram(true); });

  function startHologram(skip) {
    const root = $('holo');
    if (skip || !config) { root.remove(); return reveal(); }
    holoCtl = window.Hologram.play({
      root, canvas: $('holo-canvas'), textEl: $('holo-text'), text: config.hologram[lang], onDone: reveal
    });
    $('holo-skip').addEventListener('click', () => holoCtl.skip());
  }
  function reveal() {
    document.body.classList.remove('is-intro');
    $('panel').removeAttribute('aria-hidden');
  }

  // ---------- language ----------
  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    const t = $('holo-text');
    if (t && config) t.textContent = config.hologram[lang];
    if (dob.getAttribute('aria-invalid') === 'true') validate(true);
  }
  document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => {
    lang = b.dataset.lang; T.setLang(lang); applyLang();
    if ($('modal').open) openModal(modalKey);
  }));

  // ---------- date input: auto dots + validation ----------
  dob.addEventListener('input', (e) => {
    const deleting = (e.inputType || '').startsWith('delete');
    const d = dob.value.replace(/\D/g, '').slice(0, 8);
    let out = d.slice(0, 2);
    if (d.length > 2) out += '.' + d.slice(2, 4);
    if (d.length > 4) out += '.' + d.slice(4);
    // add the dot right after a completed day or month, but never fight the user when deleting
    if (!deleting && (d.length === 2 || d.length === 4)) out += '.';
    dob.value = out;
    validate(false);
  });
  dob.addEventListener('blur', () => validate(true));

  function validate(showError) {
    const v = dob.value;
    const r = T.parseDate(v);
    const ok = !r.error;
    err.textContent = '';
    dob.removeAttribute('aria-invalid');
    if (!ok && showError && v.length) {
      err.textContent = T.MESSAGES[lang][r.error];
      dob.setAttribute('aria-invalid', 'true');
    } else if (!ok && !showError && v.length === 10) { // a full-length date that is wrong: say so immediately
      err.textContent = T.MESSAGES[lang][r.error];
      dob.setAttribute('aria-invalid', 'true');
    }
    spin.disabled = !(ok && gender);
    return ok ? r : null;
  }

  // ---------- gender ----------
  document.querySelectorAll('.gender button').forEach((b) => b.addEventListener('click', () => {
    gender = b.dataset.gender;
    document.querySelectorAll('.gender button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    validate(false);
  }));

  // ---------- calendar ----------
  const cal = $('cal'), calBtn = $('cal-btn');
  let vy, vm;
  function openCal() {
    const r = T.parseDate(dob.value);
    const now = new Date();
    vy = r.error ? now.getFullYear() - 30 : r.year;
    vm = r.error ? now.getMonth() : r.month - 1;
    renderCal();
    cal.hidden = false;
    calBtn.setAttribute('aria-expanded', 'true');
  }
  function closeCal() { cal.hidden = true; calBtn.setAttribute('aria-expanded', 'false'); }
  calBtn.addEventListener('click', () => (cal.hidden ? openCal() : closeCal()));
  document.addEventListener('click', (e) => { if (!cal.hidden && !cal.contains(e.target) && !calBtn.contains(e.target)) closeCal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !cal.hidden) { closeCal(); calBtn.focus(); } });

  function renderCal() {
    const M = T.MESSAGES[lang];
    const now = new Date();
    const selected = T.parseDate(dob.value);
    cal.textContent = '';
    const head = document.createElement('div'); head.className = 'cal-head';
    const prev = document.createElement('button'); prev.type = 'button'; prev.textContent = '‹'; prev.setAttribute('aria-label', M.prev);
    const next = document.createElement('button'); next.type = 'button'; next.textContent = '›'; next.setAttribute('aria-label', M.next);
    const ms = document.createElement('select'); ms.setAttribute('aria-label', M.month);
    M.months.forEach((n, i) => { const o = new Option(n, i); if (i === vm) o.selected = true; ms.add(o); });
    const ys = document.createElement('select'); ys.setAttribute('aria-label', M.year);
    for (let y = now.getFullYear(); y >= 1900; y--) { const o = new Option(y, y); if (y === vy) o.selected = true; ys.add(o); }
    head.append(prev, ms, ys, next);
    cal.append(head);
    const shift = (d) => { vm += d; if (vm < 0) { vm = 11; vy--; } if (vm > 11) { vm = 0; vy++; } vy = Math.max(1900, Math.min(now.getFullYear(), vy)); renderCal(); };
    prev.addEventListener('click', () => shift(-1));
    next.addEventListener('click', () => shift(1));
    ms.addEventListener('change', () => { vm = +ms.value; renderCal(); });
    ys.addEventListener('change', () => { vy = +ys.value; renderCal(); });

    const grid = document.createElement('div'); grid.className = 'cal-grid';
    M.dows.forEach((d) => { const s = document.createElement('span'); s.className = 'dow'; s.textContent = d; grid.append(s); });
    const first = (new Date(vy, vm, 1).getDay() + 6) % 7; // Monday first
    for (let i = 0; i < first; i++) grid.append(document.createElement('span'));
    const days = new Date(vy, vm + 1, 0).getDate();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (let d = 1; d <= days; d++) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = d;
      const date = new Date(vy, vm, d);
      if (date > today) b.disabled = true;
      if (!selected.error && selected.year === vy && selected.month === vm + 1 && selected.day === d) b.setAttribute('aria-selected', 'true');
      b.addEventListener('click', () => {
        dob.value = `${String(d).padStart(2, '0')}.${String(vm + 1).padStart(2, '0')}.${vy}`;
        closeCal(); validate(true); dob.focus();
      });
      grid.append(b);
    }
    cal.append(grid);
  }

  // ---------- Intro / Privacy modals ----------
  const modal = $('modal'); let modalKey = null;
  function openModal(key) {
    if (!config) return;
    modalKey = key;
    const html = (config.rich[key] || {})[lang] || '';
    // content is sanitized on the server when saved and again here before it is shown
    $('modal-body').innerHTML = window.DOMPurify.sanitize(html);
    if (!modal.open) modal.showModal();
  }
  $('btn-intro').addEventListener('click', () => openModal('intro'));
  $('btn-privacy').addEventListener('click', () => openModal('privacy'));
  $('modal-close').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

  // ---------- spin ----------
  $('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = validate(true);
    if (!r || !gender) return;
    spin.classList.add('is-spinning'); spin.disabled = true;
    try { sessionStorage.setItem('reading', JSON.stringify({ date: dob.value, gender })); } catch (x) { /* storage unavailable */ }
    setTimeout(() => { location.href = '/result'; }, 900);
  });

  applyLang();
})();

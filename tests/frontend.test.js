'use strict';
// Front-end behaviour check in jsdom (no real browser available in CI): date mask, validation,
// calendar, hologram lifecycle, modals and the result page.
const os = require('os');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tarot-fe-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOADS_DIR = path.join(tmp, 'uploads');

const { JSDOM } = require('jsdom');
const { seedIfEmpty } = require('../server/seed');
const { createPublicApp } = require('../server/publicApp');

let srv, base;
test.before(async () => {
  await seedIfEmpty();
  await new Promise((r) => { srv = createPublicApp().listen(0, r); });
  base = 'http://127.0.0.1:' + srv.address().port;
});
test.after(() => { srv.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(25); } return false; };

function open(urlPath, { session } = {}) {
  return JSDOM.fromURL(base + urlPath, {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) {
      const stub = new Proxy(function () {}, { get: () => stub, set: () => true, apply: () => stub });
      w.HTMLCanvasElement.prototype.getContext = () => stub;
      w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
      w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
      w.fetch = (u, o) => fetch(new URL(u, base), o);
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      w.URL.createObjectURL = () => 'blob:x';
      if (session) w.sessionStorage.setItem('reading', JSON.stringify(session));
    }
  });
}
// The page title is already in the static HTML, so wait for something only the script sets.
const ready = (d) => until(() => d.getElementById('bg').style.backgroundImage !== '');
const type = (w, input, value, inputType = 'insertText') => {
  input.value = value;
  input.dispatchEvent(new w.InputEvent('input', { bubbles: true, inputType }));
};

test('home: content from API, hologram plays then disappears, form appears', async () => {
  const dom = await open('/');
  const { document: d } = dom.window;
  assert.ok(await ready(d));
  assert.equal(d.getElementById('t-main').textContent, 'Bulgarian mythology tarot');
  assert.match(d.getElementById('bg').style.backgroundImage, /hero-bg\.png/);
  assert.ok(d.body.classList.contains('is-intro'), 'form is hidden while the hologram plays');
  assert.ok(await until(() => d.getElementById('holo-text').textContent.length > 0));
  d.getElementById('holo-skip').click();
  assert.ok(await until(() => !d.getElementById('holo'), 3000), 'hologram element is removed');
  assert.ok(!d.body.classList.contains('is-intro'));
  dom.window.close();
});

test('home: the hologram runs again on a fresh load', async () => {
  const dom = await open('/');
  assert.ok(await until(() => dom.window.document.getElementById('holo') !== null && dom.window.document.body.classList.contains('is-intro')));
  dom.window.close();
});

test('date input: automatic dots, deleting works, validation and Spin enabling', async () => {
  const dom = await open('/'); const w = dom.window; const d = w.document;
  assert.ok(await ready(d));
  const dob = d.getElementById('dob'), spin = d.getElementById('spin');

  type(w, dob, '23'); assert.equal(dob.value, '23.');
  type(w, dob, '23.', 'deleteContentBackward'); // user deletes the dot
  type(w, dob, '23', 'deleteContentBackward'); assert.equal(dob.value, '23');
  type(w, dob, '2309'); assert.equal(dob.value, '23.09.');
  type(w, dob, '23.09.1985'); assert.equal(dob.value, '23.09.1985');
  type(w, dob, '23091985'); assert.equal(dob.value, '23.09.1985'); // pasted digits get formatted
  type(w, dob, '23.09.19856789'); assert.equal(dob.value, '23.09.1985'); // capped at 8 digits

  assert.equal(spin.disabled, true, 'needs a gender too');
  d.querySelector('[data-gender="female"]').click();
  assert.equal(spin.disabled, false);
  assert.equal(d.querySelector('[data-gender="female"]').getAttribute('aria-checked'), 'true');
  assert.equal(d.querySelector('[data-gender="male"]').getAttribute('aria-checked'), 'false');

  type(w, dob, '31.02.1985'); // full-length but not a real date
  assert.equal(spin.disabled, true);
  assert.match(d.getElementById('dob-error').textContent, /не съществува/);
  type(w, dob, '01.01.2999');
  assert.match(d.getElementById('dob-error').textContent, /бъдещето/);
  assert.equal(dob.getAttribute('aria-invalid'), 'true');
  type(w, dob, '29.02.2000'); assert.equal(spin.disabled, false); // real leap day
  type(w, dob, '29.02.1900'); assert.equal(spin.disabled, true);  // 1900 is not a leap year
  dom.window.close();
});

test('calendar: opens, picks a date in site format, future days are disabled', async () => {
  const dom = await open('/'); const w = dom.window; const d = w.document;
  assert.ok(await ready(d));
  d.getElementById('cal-btn').click();
  const cal = d.getElementById('cal');
  assert.equal(cal.hidden, false);
  assert.equal(cal.querySelectorAll('select').length, 2);
  const years = cal.querySelectorAll('select')[1];
  years.value = '1990'; years.dispatchEvent(new w.Event('change'));
  const months = d.querySelectorAll('#cal select')[0];
  months.value = '5'; months.dispatchEvent(new w.Event('change'));
  [...d.querySelectorAll('#cal .cal-grid button')].find((b) => b.textContent === '15').click();
  assert.equal(d.getElementById('dob').value, '15.06.1990');
  assert.equal(cal.hidden, true);
  // current month: days after today are disabled
  d.getElementById('cal-btn').click();
  const now = new Date();
  const ys = d.querySelectorAll('#cal select')[1]; ys.value = String(now.getFullYear()); ys.dispatchEvent(new w.Event('change'));
  const ms = d.querySelectorAll('#cal select')[0]; ms.value = String(now.getMonth()); ms.dispatchEvent(new w.Event('change'));
  const days = [...d.querySelectorAll('#cal .cal-grid button')];
  const last = days[days.length - 1];
  if (now.getDate() < days.length) assert.equal(last.disabled, true);
  assert.equal(days[now.getDate() - 1].disabled, false);
  dom.window.close();
});

test('Intro and Privacy modals show sanitized content in the chosen language', async () => {
  const dom = await open('/'); const w = dom.window; const d = w.document;
  assert.ok(await ready(d));
  d.getElementById('btn-intro').click();
  assert.ok(d.getElementById('modal').hasAttribute('open'));
  assert.match(d.getElementById('modal-body').textContent, /Добре дошли/);
  d.querySelector('[data-lang="en"]').click();
  assert.match(d.getElementById('modal-body').textContent, /Welcome/);
  d.getElementById('modal-close').click();
  d.getElementById('btn-privacy').click();
  assert.match(d.getElementById('modal-body').textContent, /Privacy policy/);
  dom.window.close();
});

test('spin stores the reading and the result page renders the analysis', async () => {
  const dom = await open('/'); const w = dom.window; const d = w.document;
  assert.ok(await ready(d));
  type(w, d.getElementById('dob'), '23091985');
  d.querySelector('[data-gender="female"]').click();
  d.getElementById('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  assert.deepEqual(JSON.parse(w.sessionStorage.getItem('reading')), { date: '23.09.1985', gender: 'female' });
  dom.window.close();

  const res = await open('/result', { session: { date: '23.09.1985', gender: 'female' } });
  const r = res.window.document;
  assert.ok(await until(() => !r.getElementById('sheets').hidden));
  assert.equal(r.querySelectorAll('.sheet.cover h2').length, 2);
  assert.equal(r.querySelector('.sheet.cover .cover-text.en h2').textContent, 'Self-reflection');
  assert.equal(r.querySelector('.sheet.cover .cover-text.bg h2').textContent, 'Самопознание');
  const body = r.querySelector('.sheet.body');
  assert.ok(body.querySelectorAll('h3').length >= 3);
  assert.match(body.textContent, /Благословени лични посоки/);
  assert.match(body.textContent, /Blessed Personal Directions/);
  assert.ok(!/гуа|gua/i.test(r.body.textContent), 'the Gua number/name is never shown');
  assert.equal(r.getElementById('btn-pdf').disabled, false);
  res.window.close();
});

test('result page without a reading goes back to the start page', async () => {
  const dom = await open('/result');
  assert.ok(await until(() => dom.window.sessionStorage.getItem('reading') === null));
  dom.window.close();
});

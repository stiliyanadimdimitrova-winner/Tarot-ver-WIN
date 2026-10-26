'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tarot-pub-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOADS_DIR = path.join(tmp, 'uploads');

const { seedIfEmpty } = require('../server/seed');
const { createPublicApp } = require('../server/publicApp');

let srv, P;
const post = (url, body) => fetch(P + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test.before(async () => {
  await seedIfEmpty();
  await new Promise((r) => { srv = createPublicApp().listen(0, r); });
  P = 'http://127.0.0.1:' + srv.address().port;
});
test.after(() => { srv.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('the repository code contains no reference to a control panel', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const root = path.join(__dirname, '..');
  const files = [...walk(path.join(root, 'public')), ...walk(path.join(root, 'server')), path.join(root, 'package.json'), path.join(root, 'README.md'), path.join(root, '.env.example')]
    .filter((f) => /\.(html|js|css|json|md|example)$/.test(f));
  const word = new RegExp(['adm' + 'in', 'control[- ]?pan' + 'el', 'пан' + 'ел'].join('|'), 'i');
  for (const f of files) assert.ok(!word.test(fs.readFileSync(f, 'utf8')), f);
});

test('there is no way to write through the public API', async () => {
  for (const p of ['/adm' + 'in', '/api/adm' + 'in/all']) assert.equal((await fetch(P + p)).status, 404);
  assert.equal((await fetch(P + '/api/public/config', { method: 'PUT' })).status, 404);
});

test('config is served and analyze validates input and never leaks internals', async () => {
  const cfg = await (await fetch(P + '/api/public/config')).json();
  assert.equal(cfg.title.main, 'Bulgarian mythology tarot');
  for (const [date, gender] of [['31.02.1990', 'male'], ['01.01.2999', 'male'], ['garbage', 'male'], ['01.01.1990', 'other']]) {
    assert.equal((await post('/api/analyze', { date, gender })).status, 400, date + gender);
  }
  const raw = JSON.stringify(await (await post('/api/analyze', { date: '23.09.1985', gender: 'female' })).json());
  assert.ok(!/"gua"|"values"|"debug"|"x2"|"e2"/.test(raw));
});

test('PDF is generated with a cover and analysis pages', async () => {
  const res = await post('/api/analyze/pdf', { date: '31.12.1999', gender: 'male' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok((buf.toString('latin1').match(/\/Type \/Page\b/g) || []).length >= 2);
});

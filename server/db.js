'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'tarot.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rich_texts (key TEXT PRIMARY KEY, bg_html TEXT NOT NULL DEFAULT '', en_html TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS text_styles (
  field_key TEXT PRIMARY KEY, font_family TEXT NOT NULL DEFAULT 'serif',
  font_size INTEGER NOT NULL DEFAULT 11, bold INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS algorithms (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL,
  previous_code TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS zodiac_cards (
  slug TEXT PRIMARY KEY, name_bg TEXT NOT NULL, name_en TEXT NOT NULL,
  image_path TEXT, bg_text TEXT NOT NULL DEFAULT '', en_text TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS arcana (
  number INTEGER PRIMARY KEY, name_bg TEXT NOT NULL, name_en TEXT NOT NULL,
  image_path TEXT, bg_text TEXT NOT NULL DEFAULT '', en_text TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS gua_table (
  gua INTEGER PRIMARY KEY, grp TEXT NOT NULL,
  success_bg TEXT, success_en TEXT, health_bg TEXT, health_en TEXT,
  love_bg TEXT, love_en TEXT, balance_bg TEXT, balance_en TEXT);
`);

// ---- migrations (older databases get the new columns, nothing is lost) ----
// Arcana texts live in one JSON column: gender -> section -> language (see arcanaTexts.js).
const arcanaCols = db.prepare('PRAGMA table_info(arcana)').all().map((c) => c.name);
if (!arcanaCols.includes('sections_json')) db.exec("ALTER TABLE arcana ADD COLUMN sections_json TEXT NOT NULL DEFAULT '{}'");

// ---- helpers ----
const getSettingStmt = db.prepare('SELECT value_json FROM settings WHERE key = ?');
const setSettingStmt = db.prepare(
  'INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json'
);

function getSetting(key, fallback = null) {
  const row = getSettingStmt.get(key);
  return row ? JSON.parse(row.value_json) : fallback;
}
function setSetting(key, value) {
  setSettingStmt.run(key, JSON.stringify(value));
}
function allSettings() {
  const out = {};
  for (const r of db.prepare('SELECT key, value_json FROM settings').all()) out[r.key] = JSON.parse(r.value_json);
  return out;
}

module.exports = { db, ROOT, DATA_DIR, getSetting, setSetting, allSettings };

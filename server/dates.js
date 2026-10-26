'use strict';

// Parses "DD.MM.YYYY" (also accepts / or - as separators). Returns {day, month, year} or throws.
function parseDate(str, now = new Date()) {
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(String(str || '').trim());
  if (!m) throw new Error('invalid_format');
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (year < 1900) throw new Error('year_out_of_range');
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    throw new Error('invalid_date');
  }
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  if (d.getTime() > today) throw new Error('future_date');
  return { day, month, year };
}

function parseGender(g) {
  if (g === 'male' || g === 'female') return g;
  throw new Error('invalid_gender');
}

module.exports = { parseDate, parseGender };

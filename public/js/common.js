'use strict';
(function () {
  const MESSAGES = {
    bg: {
      invalid_format: 'Въведи дата във формат ДД.ММ.ГГГГ.',
      invalid_date: 'Тази дата не съществува.',
      future_date: 'Датата не може да е в бъдещето.',
      year_out_of_range: 'Годината трябва да е 1900 или по-късна.',
      server: 'Нещо се обърка. Опитай отново след малко.',
      months: ['Януари', 'Февруари', 'Март', 'Април', 'Май', 'Юни', 'Юли', 'Август', 'Септември', 'Октомври', 'Ноември', 'Декември'],
      dows: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'],
      prev: 'Предишен месец', next: 'Следващ месец', month: 'Месец', year: 'Година'
    },
    en: {
      invalid_format: 'Enter a date as DD.MM.YYYY.',
      invalid_date: 'That date does not exist.',
      future_date: 'The date cannot be in the future.',
      year_out_of_range: 'The year must be 1900 or later.',
      server: 'Something went wrong. Please try again in a moment.',
      months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      dows: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
      prev: 'Previous month', next: 'Next month', month: 'Month', year: 'Year'
    }
  };

  // Same rules as the server (which always re-validates): real calendar date, 1900+, not in the future.
  function parseDate(str) {
    const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(String(str || '').trim());
    if (!m) return { error: 'invalid_format' };
    const day = +m[1], month = +m[2], year = +m[3];
    if (year < 1900) return { error: 'year_out_of_range' };
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return { error: 'invalid_date' };
    const now = new Date();
    if (d.getTime() > Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) return { error: 'future_date' };
    return { day, month, year };
  }

  function getLang() {
    try { const l = localStorage.getItem('lang'); if (l === 'bg' || l === 'en') return l; } catch (e) { /* storage unavailable */ }
    return 'bg';
  }
  function setLang(l) { try { localStorage.setItem('lang', l); } catch (e) { /* ignore */ } }

  async function api(path, body) {
    const res = await fetch(path, body === undefined ? undefined : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!res.ok) {
      let msg = 'server';
      try { msg = (await res.json()).error || msg; } catch (e) { /* not json */ }
      const err = new Error(msg); err.status = res.status; throw err;
    }
    return res;
  }

  window.Tarot = { MESSAGES, parseDate, getLang, setLang, api };
})();

// Algorithm 3: Gua number (Feng Shui Kua).
// input:  { day, month, year, gender }
// output: { gua: 1..9 (never 5), group: 'east' | 'west' }
// The server looks up the four positive directions for this gua in the gua_table.
module.exports = function (input) {
  function singleDigit(n) {
    while (n > 9) {
      var s = 0;
      String(n).split('').forEach(function (d) { s += Number(d); });
      n = s;
    }
    return n;
  }

  // Step 1: solar year. Before Li Chun (4 February) use the previous year.
  var year = input.year;
  if (input.month < 2 || (input.month === 2 && input.day < 4)) year = year - 1;

  // Step 2: last two digits of that year, reduced to a single digit.
  var d = singleDigit(year % 100);

  // Step 3: by gender and century.
  var n;
  if (year >= 2000) {
    n = input.gender === 'male' ? 9 - d : 6 + d;
  } else {
    n = input.gender === 'male' ? 10 - d : 5 + d;
  }
  n = singleDigit(n);
  if (n === 0) n = 9; // 9 - 9 = 0 is read as 9 in the classical system

  // Step 4: special case Gua 5.
  if (n === 5) n = input.gender === 'male' ? 2 : 8;

  // Step 5: group.
  var group = (n === 1 || n === 3 || n === 4 || n === 9) ? 'east' : 'west';
  return { gua: n, group: group };
};

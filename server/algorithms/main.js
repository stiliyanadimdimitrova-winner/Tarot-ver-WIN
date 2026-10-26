// Algorithm 2: main algorithm (22 Major Arcana).
// input:  { day, month, year, gender }
// output: {
//   values: { A, C, E, G, I, e2, x2 },   // each 1..22 (internal, never shown to users)
//   arcana: [0..21, ...],                // arcana numbers in order A, C, E, e2, G, I, x2
//   watermarkArcana: 0..21               // arcana of x2
// }
// Arcana mapping: 22 <-> "0 The Fool", 1..21 <-> I..XXI.
module.exports = function (input) {
  function digitSum(n) {
    var s = 0;
    String(n).split('').forEach(function (d) { s += Number(d); });
    return s;
  }
  // Always reduce to a number from 1 to 22.
  function reduce(n) {
    while (n > 22) n = digitSum(n);
    return n;
  }
  function toArcana(n) { return n === 22 ? 0 : n; }

  var A = reduce(input.day);
  var C = reduce(input.month);
  var E = reduce(input.year);            // full year, no Li Chun correction
  var G = reduce(A + C + E);
  var I = reduce(A + C + E + G);
  var e2 = reduce(E + I);
  var x2 = reduce(reduce(e2 + G + I) + e2);

  var order = [A, C, E, e2, G, I, x2];
  return {
    values: { A: A, C: C, E: E, G: G, I: I, e2: e2, x2: x2 },
    arcana: order.map(toArcana),
    watermarkArcana: toArcana(x2)
  };
};

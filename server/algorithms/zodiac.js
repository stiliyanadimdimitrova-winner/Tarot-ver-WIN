// Algorithm 1: zodiac element -> card slug.
// Contract: module.exports = function(input) { return output }
// input:  { day, month, year, gender: 'male' | 'female' }
// output: { element: 'fire'|'earth'|'air'|'water', cardSlug: 'queen_fire' | 'king_fire' | ... }
module.exports = function (input) {
  var md = input.month * 100 + input.day; // e.g. 21 March -> 321

  // Inclusive periods as [startMMDD, endMMDD]. 22/12-19/01 wraps the year,
  // so it is split into 22/12-31/12 and 01/01-19/01.
  var periods = {
    fire:  [[321, 419], [723, 822], [1122, 1221]],
    earth: [[420, 520], [823, 922], [1222, 1231], [101, 119]],
    air:   [[521, 620], [923, 1022], [120, 218]],
    water: [[621, 722], [1023, 1121], [219, 320]]
  };

  var element = null;
  Object.keys(periods).forEach(function (name) {
    periods[name].forEach(function (p) {
      if (md >= p[0] && md <= p[1]) element = name;
    });
  });
  if (!element) throw new Error('No element for date ' + input.day + '/' + input.month);

  var prefix = input.gender === 'female' ? 'queen_' : 'king_';
  return { element: element, cardSlug: prefix + element };
};

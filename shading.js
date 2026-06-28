// shading.js — pure generic-sun helpers for the shading editor.
// World axes: N=-z, S=+z, E=+x, W=-x. The sun follows a simple day arc
// (east → south(high) → west); no dates/astronomy ("average sun").
(function () {
  'use strict';
  var MAX_ELEV = 62; // average midday elevation for Israel, degrees

  // t01: 0=sunrise(E), 0.5=noon(S, high), 1=sunset(W). Returns a unit-ish dir.
  function sunDirAt(t01, maxElev) {
    maxElev = maxElev || MAX_ELEV;
    var azDeg = 90 + t01 * 180;
    var elevDeg = maxElev * Math.sin(t01 * Math.PI);
    var az = azDeg * Math.PI / 180, elev = elevDeg * Math.PI / 180;
    var cosE = Math.cos(elev);
    return {
      x: Math.sin(az) * cosE,
      y: Math.sin(elev),
      z: -Math.cos(az) * cosE,
      azDeg: azDeg, elevDeg: elevDeg,
    };
  }

  // n weighted samples across the day for the exposure metric.
  function sunSteps(n) {
    n = n || 7;
    var steps = [], lo = 0.12, hi = 0.88;
    for (var i = 0; i < n; i++) {
      var t = lo + (hi - lo) * (i / (n - 1));
      steps.push({ t: t, dir: sunDirAt(t), weight: Math.max(0.05, Math.sin(t * Math.PI)) });
    }
    return steps;
  }

  function rate(pct) {
    if (pct >= 85) return { label: 'מצוין', cls: 'ok' };
    if (pct >= 70) return { label: 'טוב', cls: 'ok' };
    if (pct >= 50) return { label: 'בינוני', cls: 'warn' };
    return { label: 'נמוך', cls: 'bad' };
  }

  // final "sun the client gets" = orientation yield (%) × shading exposure (%)
  function combine(yieldPct, exposurePct) {
    return Math.round((yieldPct / 100) * exposurePct);
  }

  var api = { sunDirAt: sunDirAt, sunSteps: sunSteps, rate: rate, combine: combine };
  if (typeof window !== 'undefined') window.Shading = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

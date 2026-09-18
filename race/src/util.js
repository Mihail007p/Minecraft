/* NITRO RUSH — utilities (math, rng, formatting) */
(function () {
  'use strict';
  var NR = (window.NR = window.NR || {});
  var U = {};

  U.TAU = Math.PI * 2;
  U.DEG = Math.PI / 180;

  U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  U.clamp01 = function (v) { return v < 0 ? 0 : (v > 1 ? 1 : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.inverseLerp = function (a, b, v) { return b === a ? 0 : U.clamp01((v - a) / (b - a)); };
  U.smoothstep = function (t) { t = U.clamp01(t); return t * t * (3 - 2 * t); };
  U.sign = function (v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); };
  U.mix = U.lerp;

  /* frame-rate independent exponential approach */
  U.damp = function (a, b, lambda, dt) { return U.lerp(a, b, 1 - Math.exp(-lambda * dt)); };
  U.dampVec = function (out, ax, ay, az, bx, by, bz, lambda, dt) {
    var k = 1 - Math.exp(-lambda * dt);
    out.x = ax + (bx - ax) * k; out.y = ay + (by - ay) * k; out.z = az + (bz - az) * k;
    return out;
  };

  U.wrapAngle = function (a) {
    a = (a + Math.PI) % U.TAU;
    if (a < 0) a += U.TAU;
    return a - Math.PI;
  };
  U.angleDelta = function (from, to) { return U.wrapAngle(to - from); };

  U.dist2 = function (ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); };
  U.dist2sq = function (ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };

  /* deterministic RNG (mulberry32) */
  U.rng = function (seed) {
    var s = (seed | 0) || 1;
    var f = function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next: f,
      range: function (a, b) { return a + (b - a) * f(); },
      int: function (a, b) { return Math.floor(a + (b - a + 1) * f()) | 0; },
      sign: function () { return f() < 0.5 ? -1 : 1; },
      chance: function (p) { return f() < p; },
      pick: function (arr) { return arr[Math.floor(f() * arr.length) % arr.length]; },
      shuffle: function (arr) {
        for (var i = arr.length - 1; i > 0; i--) {
          var j = Math.floor(f() * (i + 1));
          var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      }
    };
  };

  /* deterministic value noise (1D), smooth, periodic-safe */
  U.makeNoise1 = function (seed) {
    var r = U.rng(seed);
    var table = new Float32Array(256);
    for (var i = 0; i < 256; i++) table[i] = r.next() * 2 - 1;
    return function (x) {
      var xi = Math.floor(x), xf = x - xi;
      var a = table[((xi % 256) + 256) % 256];
      var b = table[(((xi + 1) % 256) + 256) % 256];
      var t = xf * xf * (3 - 2 * xf);
      return a + (b - a) * t;
    };
  };

  U.formatTime = function (sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec - m * 60);
    var cs = Math.floor((sec - m * 60 - s) * 100);
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (cs < 10 ? '0' : '') + cs;
  };
  U.formatShort = function (sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec - m * 60);
    return m > 0 ? (m + ':' + (s < 10 ? '0' : '') + s) : (s + 'с');
  };
  U.formatMoney = function (n) {
    n = Math.round(n) || 0;
    var s = String(Math.abs(n)), out = '', c = 0;
    for (var i = s.length - 1; i >= 0; i--) {
      out = s[i] + out; c++;
      if (c % 3 === 0 && i > 0) out = ' ' + out;
    }
    return (n < 0 ? '-' : '') + out;
  };
  U.ordinalRu = function (n) { return n + '-е место'; };
  U.placeRu = function (n) {
    if (n === 1) return '1-е место';
    if (n === 2) return '2-е место';
    if (n === 3) return '3-е место';
    return n + '-е место';
  };

  /* rgb helpers */
  U.hslToHex = function (h, s, l) {
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var hp = ((h % 360) + 360) % 360 / 60;
    var x = c * (1 - Math.abs((hp % 2) - 1));
    var r = 0, g = 0, b = 0;
    if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; } else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
    var m = l - c / 2;
    var to = function (v) { var q = Math.round(U.clamp01(v + m) * 255); return q.toString(16).padStart(2, '0'); };
    return '#' + to(r) + to(g) + to(b);
  };
  U.hexToInt = function (hex) {
    if (typeof hex === 'number') return hex >>> 0;
    return parseInt(String(hex).replace('#', ''), 16) || 0;
  };
  U.shade = function (hex, k) {
    // k>0 lighten toward white, k<0 darken toward black
    var n = U.hexToInt(hex);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (k >= 0) { r = r + (255 - r) * k; g = g + (255 - g) * k; b = b + (255 - b) * k; }
    else { r = r * (1 + k); g = g * (1 + k); b = b * (1 + k); }
    return ((Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b));
  };

  /* simple spatial-ish helpers */
  U.pickWeighted = function (rnd, items, weightFn) {
    var total = 0, i;
    for (i = 0; i < items.length; i++) total += weightFn(items[i], i);
    var r = rnd.next() * total;
    for (i = 0; i < items.length; i++) {
      r -= weightFn(items[i], i);
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  };

  NR.U = U;
})();

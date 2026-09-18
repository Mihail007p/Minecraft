/* NITRO RUSH — track generation (closed loop from angle-space control points) */
(function () {
  'use strict';
  var NR = (window.NR = window.NR || {});
  var U = NR.U;

  var DEG = Math.PI / 180;

  /* ------------------------------------------------------------------
     Track definitions.
     ctrl: periodic control points: a = angle (deg), r = radius from centre (m),
     y = elevation (m).  Radii control corner tightness: small r = tight turn,
     big r = fast sweep / straight.
     ramps / gates: positions as fraction of lap length.
     ------------------------------------------------------------------ */
  var TRACKS = [
    {
      id: 'city', name: 'Неоновый город', theme: 'city', laps: 2, width: 16.5, smooth: 1,
      desc: 'Широкие проспекты, развязки и ночные огни мегаполиса.',
      ctrl: [
        { a: 0, r: 300, y: 0 }, { a: 30, r: 258, y: 2 }, { a: 60, r: 322, y: 6 }, { a: 90, r: 224, y: 4 },
        { a: 120, r: 286, y: 0 }, { a: 150, r: 344, y: -3 }, { a: 180, r: 240, y: 0 }, { a: 210, r: 306, y: 3 },
        { a: 240, r: 204, y: 6 }, { a: 270, r: 282, y: 2 }, { a: 300, r: 364, y: -2 }, { a: 330, r: 320, y: 0 }
      ],
      ramps: [0.17, 0.46, 0.78], gates: [0.10, 0.29, 0.55, 0.71, 0.92], tunnel: [[0.60, 0.68]]
    },
    {
      id: 'coast', name: 'Прибрежное шоссе', theme: 'coast', laps: 2, width: 17, smooth: 1,
      desc: 'Плавные S-образные связки вдоль океана. Идеально для дрифта.',
      ctrl: [
        { a: 0, r: 282, y: 0 }, { a: 32, r: 222, y: 2 }, { a: 62, r: 262, y: 4 }, { a: 92, r: 178, y: 2 },
        { a: 122, r: 242, y: 0 }, { a: 152, r: 312, y: -2 }, { a: 182, r: 262, y: 0 }, { a: 212, r: 196, y: 3 },
        { a: 242, r: 252, y: 5 }, { a: 272, r: 304, y: 2 }, { a: 302, r: 238, y: 0 }, { a: 332, r: 218, y: 1 }
      ],
      ramps: [0.22, 0.63], gates: [0.14, 0.38, 0.5, 0.86]
    },
    {
      id: 'mountain', name: 'Горный серпантин', theme: 'mountain', laps: 3, width: 14.5, smooth: 2,
      desc: 'Тесные повороты и перепады высот. Требует тормоза и дрифта.',
      ctrl: [
        { a: 0, r: 218, y: 0 }, { a: 30, r: 168, y: 6 }, { a: 50, r: 152, y: 10 }, { a: 70, r: 190, y: 15 },
        { a: 90, r: 160, y: 9 }, { a: 115, r: 142, y: 3 }, { a: 140, r: 180, y: -3 }, { a: 165, r: 246, y: -8 },
        { a: 190, r: 202, y: -12 }, { a: 215, r: 155, y: -9 }, { a: 240, r: 170, y: -3 }, { a: 265, r: 225, y: 3 },
        { a: 290, r: 254, y: 8 }, { a: 315, r: 208, y: 5 }, { a: 340, r: 188, y: 1 }
      ],
      ramps: [0.30, 0.72], gates: [0.18, 0.44, 0.62, 0.9]
    },
    {
      id: 'desert', name: 'Пустынная трасса', theme: 'desert', laps: 2, width: 17.5, smooth: 0,
      desc: 'Длинные прямые, где решает максимальная скорость и нитро.',
      ctrl: [
        { a: 0, r: 462, y: 0 }, { a: 24, r: 432, y: 1 }, { a: 48, r: 302, y: 3 }, { a: 72, r: 242, y: 4 },
        { a: 96, r: 302, y: 2 }, { a: 120, r: 482, y: 0 }, { a: 144, r: 522, y: 0 }, { a: 168, r: 422, y: -2 },
        { a: 192, r: 282, y: -4 }, { a: 216, r: 222, y: -2 }, { a: 240, r: 302, y: 0 }, { a: 264, r: 442, y: 2 },
        { a: 288, r: 502, y: 1 }, { a: 312, r: 382, y: 0 }, { a: 336, r: 402, y: 1 }
      ],
      ramps: [0.12, 0.34, 0.58, 0.83], gates: [0.08, 0.26, 0.48, 0.66, 0.88]
    },
    {
      id: 'industry', name: 'Промзона', theme: 'industry', laps: 3, width: 16, smooth: 1,
      desc: 'Шиканы между складами, контейнеры и трамплины. Техничная трасса.',
      ctrl: [
        { a: 0, r: 268, y: 0 }, { a: 25, r: 182, y: 1 }, { a: 45, r: 198, y: 2 }, { a: 70, r: 338, y: 4 },
        { a: 95, r: 216, y: 3 }, { a: 115, r: 180, y: 1 }, { a: 140, r: 308, y: 0 }, { a: 165, r: 252, y: -1 },
        { a: 190, r: 176, y: -3 }, { a: 215, r: 196, y: -2 }, { a: 240, r: 328, y: 0 }, { a: 265, r: 288, y: 1 },
        { a: 290, r: 190, y: 3 }, { a: 315, r: 226, y: 2 }, { a: 338, r: 288, y: 0 }
      ],
      ramps: [0.16, 0.44, 0.7], gates: [0.12, 0.35, 0.6, 0.82]
    },
    {
      id: 'alpine', name: 'Альпийский перевал', theme: 'alpine', laps: 3, width: 15.5, smooth: 1,
      desc: 'Самая длинная трасса: ночной холод, ледяные дуги, перепад высот.',
      ctrl: [
        { a: 0, r: 240, y: -14 }, { a: 24, r: 192, y: -8 }, { a: 48, r: 222, y: 0 }, { a: 72, r: 162, y: 6 },
        { a: 96, r: 202, y: 12 }, { a: 120, r: 262, y: 16 }, { a: 144, r: 302, y: 12 }, { a: 168, r: 222, y: 6 },
        { a: 192, r: 182, y: 0 }, { a: 216, r: 152, y: -6 }, { a: 240, r: 202, y: -12 }, { a: 264, r: 282, y: -18 },
        { a: 288, r: 322, y: -14 }, { a: 312, r: 262, y: -8 }, { a: 336, r: 232, y: -16 }
      ],
      ramps: [0.20, 0.52, 0.8], gates: [0.13, 0.33, 0.57, 0.75, 0.94]
    }
  ];

  /* ------------------------------------------------------------------
     Periodic Catmull-Rom over control points keyed by angle
     ------------------------------------------------------------------ */
  function periodicProfile(ctrl, key) {
    var pts = ctrl.slice().sort(function (a, b) { return a.a - b.a; });
    var n = pts.length;
    var A = [], V = [];
    for (var i = 0; i < n; i++) { A.push(pts[i].a); V.push(pts[i][key]); }
    return function (angDeg) {
      var a = ((angDeg % 360) + 360) % 360;
      var i1 = 0;
      for (var i = 0; i < n; i++) {
        var a0 = A[i], a1 = (i + 1 < n) ? A[i + 1] : A[0] + 360;
        if (a >= a0 && a < a1) { i1 = i; break; }
        if (a < A[0]) { i1 = n - 1; break; }
      }
      var i0 = (i1 - 1 + n) % n, i2 = (i1 + 1) % n, i3 = (i1 + 2) % n;
      var a0 = A[i1];
      var a1 = (i1 + 1 < n) ? A[i1 + 1] : A[0] + 360;
      if (a < A[0]) { a0 = A[n - 1] - 360; a1 = A[0]; i0 = n - 2 < 0 ? n - 1 : n - 2; i2 = 0; i3 = 1 % n; i1 = n - 1; }
      var t = (a - a0) / (a1 - a0 || 1);
      var p0 = V[i0], p1 = V[i1], p2 = V[i2], p3 = V[i3];
      var t2 = t * t, t3 = t2 * t;
      return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    };
  }

  var PROF_N = 1440;         // 0.25 deg resolution
  function smoothProfile(fn, passes, period) {
    // light smoothing of a periodic function of degrees
    var N = PROF_N;
    var buf = new Float32Array(N);
    for (var i = 0; i < N; i++) buf[i] = fn(i * 360 / N);
    for (var p = 0; p < passes; p++) {
      var out = new Float32Array(N);
      for (var j = 0; j < N; j++) {
        out[j] = (buf[(j - 1 + N) % N] + 2 * buf[j] + buf[(j + 1) % N]) * 0.25;
      }
      buf = out;
    }
    return buf;
  }

  /* periodic, linearly interpolated lookup of a profile sampled in degrees */
  function sampleProfile(buf, deg) {
    var N = buf.length;
    var f = ((deg % 360) + 360) % 360 * (N / 360);
    var i0 = Math.floor(f) % N, i1 = (i0 + 1) % N, t = f - Math.floor(f);
    return buf[i0] + (buf[i1] - buf[i0]) * t;
  }

  var SPACING = 4.0;          // metres between centreline samples

  function buildTrack(def) {
    var rFn = periodicProfile(def.ctrl, 'r');
    var yFn = periodicProfile(def.ctrl, 'y');
    if (def.smooth > 0) {
      var rb = smoothProfile(rFn, def.smooth, 360);
      var yb = smoothProfile(yFn, def.smooth, 360);
      rFn = function (a) { return sampleProfile(rb, a); };
      yFn = function (a) { return sampleProfile(yb, a); };
    }

    /* fine polyline */
    var N_FINE = 2600;
    var fx = new Float64Array(N_FINE + 1), fy = new Float64Array(N_FINE + 1), fz = new Float64Array(N_FINE + 1);
    var cum = new Float64Array(N_FINE + 1);
    for (var i = 0; i <= N_FINE; i++) {
      var ang = i * 360 / N_FINE;
      var r = Math.max(40, rFn(ang));
      var rad = ang * DEG;
      fx[i] = Math.cos(rad) * r;
      fz[i] = Math.sin(rad) * r;
      fy[i] = yFn(ang);
      if (i > 0) {
        var dx = fx[i] - fx[i - 1], dz = fz[i] - fz[i - 1], dy = fy[i] - fy[i - 1];
        cum[i] = cum[i - 1] + Math.sqrt(dx * dx + dz * dz + dy * dy);
      }
    }
    var L = cum[N_FINE];
    var M = Math.max(120, Math.round(L / SPACING));

    var px = new Float32Array(M), py = new Float32Array(M), pz = new Float32Array(M);
    var tx = new Float32Array(M), tz = new Float32Array(M);
    var nx = new Float32Array(M), nz = new Float32Array(M);
    var kk = new Float32Array(M), bank = new Float32Array(M), half = new Float32Array(M);
    var sArr = new Float32Array(M);

    /* resample by arc length */
    var cursor = 0;
    for (var m = 0; m < M; m++) {
      var target = m * L / M;
      while (cursor < N_FINE - 1 && cum[cursor + 1] < target) cursor++;
      var seg = cum[cursor + 1] - cum[cursor];
      var t = seg > 1e-6 ? (target - cum[cursor]) / seg : 0;
      px[m] = fx[cursor] + (fx[cursor + 1] - fx[cursor]) * t;
      pz[m] = fz[cursor] + (fz[cursor + 1] - fz[cursor]) * t;
      py[m] = fy[cursor] + (fy[cursor + 1] - fy[cursor]) * t;
      sArr[m] = target;
    }

    /* tangents + curvature */
    for (var j = 0; j < M; j++) {
      var a = (j - 1 + M) % M, b = (j + 1) % M;
      var dx2 = px[b] - px[a], dz2 = pz[b] - pz[a];
      var len = Math.hypot(dx2, dz2) || 1;
      tx[j] = dx2 / len; tz[j] = dz2 / len;
      nx[j] = -tz[j]; nz[j] = tx[j];
    }
    var head = new Float32Array(M);
    for (var q = 0; q < M; q++) head[q] = Math.atan2(tx[q], tz[q]);
    for (var q2 = 0; q2 < M; q2++) {
      var dh = U.wrapAngle(head[(q2 + 1) % M] - head[(q2 - 1 + M) % M]);
      kk[q2] = dh / (2 * SPACING);                    // signed curvature 1/m
    }
    /* smooth curvature & derive banking + adaptive width */
    var ks = new Float32Array(M);
    for (var w = 0; w < M; w++) {
      var sum = 0;
      for (var o = -2; o <= 2; o++) sum += kk[(w + o + M) % M];
      ks[w] = sum / 5;
    }
    var design = 46;   // m/s reference speed for banking
    var g = 9.81;
    var maxBank = 5.5 * DEG;
    for (var v = 0; v < M; v++) {
      var rad2 = Math.abs(ks[v]) > 1e-5 ? 1 / ks[v] : 1e6;
      bank[v] = U.clamp(Math.atan((design * design) / Math.abs(rad2) / g) * (ks[v] < 0 ? 1 : -1), -maxBank, maxBank);
      var tight = U.clamp01(Math.abs(ks[v]) * 140);
      half[v] = (def.width * 0.5) * (1 + 0.22 * tight);
    }

    /* start line: straightest point (smoothed curvature minimum) */
    var bestIdx = 0, bestVal = Infinity;
    var win = Math.round(120 / SPACING);
    for (var si = 0; si < M; si++) {
      var acc = 0;
      for (var o2 = -win; o2 <= win; o2 += 4) acc += Math.abs(ks[(si + o2 + M) % M]);
      if (acc < bestVal) { bestVal = acc; bestIdx = si; }
    }
    /* rotate arrays so start line is index 0 */
    function rot(arr) {
      var out = new arr.constructor(M);
      for (var z = 0; z < M; z++) out[z] = arr[(z + bestIdx) % M];
      return out;
    }
    px = rot(px); py = rot(py); pz = rot(pz);
    tx = rot(tx); tz = rot(tz); nx = rot(nx); nz = rot(nz);
    kk = rot(ks); bank = rot(bank); half = rot(half);
    for (var s3 = 0; s3 < M; s3++) sArr[s3] = s3 * (L / M);

    var track = {
      def: def, theme: def.theme, id: def.id, name: def.name,
      M: M, length: L, spacing: L / M,
      px: px, py: py, pz: pz, tx: tx, tz: tz, nx: nx, nz: nz,
      k: kk, bank: bank, half: half, s: sArr,
      lamps: []
    };

    /* items ------------------------------------------------------ */
    track.gates = (def.gates || []).map(function (f) {
      var idx = Math.round(f * M) % M;
      return { s: track.s[idx], i: idx, x: track.px[idx], z: track.pz[idx], y: track.py[idx], half: track.half[idx] };
    });
    track.ramps = (def.ramps || []).map(function (f, n) {
      var idx = Math.round(f * M) % M;
      var dir = (n % 2 === 0) ? 1 : -1;
      return {
        s: track.s[idx], i: idx, x: track.px[idx], z: track.pz[idx], y: track.py[idx],
        tx: track.tx[idx], tz: track.tz[idx], half: Math.min(track.half[idx] * 0.62, 5.6),
        len: 16, height: 1.5, dir: dir
      };
    });
    track.checkpoints = [0.25, 0.5, 0.75].map(function (f) {
      var idx = Math.round(f * M) % M;
      return { s: track.s[idx], i: idx };
    });
    track.laps = def.laps || 2;

    /* helper API ------------------------------------------------- */
    track.indexAtS = function (s) {
      var sm = ((s % L) + L) % L;
      return Math.floor(sm / track.spacing) % M;
    };
    track.posAt = function (s, lateral, out) {
      out = out || {};
      var f = ((s % L) + L) % L / track.spacing;
      var i0 = Math.floor(f) % M, i1 = (i0 + 1) % M, t = f - Math.floor(f);
      out.x = px[i0] + (px[i1] - px[i0]) * t + (nx[i0] + (nx[i1] - nx[i0]) * t) * lateral;
      out.z = pz[i0] + (pz[i1] - pz[i0]) * t + (nz[i0] + (nz[i1] - nz[i0]) * t) * lateral;
      out.y = py[i0] + (py[i1] - py[i0]) * t;
      out.tx = tx[i0] + (tx[i1] - tx[i0]) * t;
      out.tz = tz[i0] + (tz[i1] - tz[i0]) * t;
      out.heading = Math.atan2(out.tx, out.tz);
      out.k = kk[i0] + (kk[i1] - kk[i0]) * t;
      out.bank = bank[i0] + (bank[i1] - bank[i0]) * t;
      out.half = half[i0] + (half[i1] - half[i0]) * t;
      return out;
    };
    track.heightAt = function (s) {
      var f = ((s % L) + L) % L / track.spacing;
      var i0 = Math.floor(f) % M, i1 = (i0 + 1) % M, t = f - Math.floor(f);
      return py[i0] + (py[i1] - py[i0]) * t;
    };
    /* nearest centreline point: local search window around hint index */
    track.project = function (x, z, hint, out) {
      out = out || {};
      var W = 34;
      var bestI = 0, bestD = Infinity, bestT = 0;
      var startI = hint == null ? 0 : (hint | 0);
      var count = hint == null ? M : W * 2 + 1;
      for (var n = 0; n < count; n++) {
        var i = ((startI + n - (hint == null ? 0 : W)) % M + M) % M;
        var i2 = (i + 1) % M;
        var ax = px[i], az = pz[i];
        var bx = px[i2] - ax, bz = pz[i2] - az;
        var bl = bx * bx + bz * bz || 1;
        var t = U.clamp01(((x - ax) * bx + (z - az) * bz) / bl);
        var cx2 = ax + bx * t, cz2 = az + bz * t;
        var d = (x - cx2) * (x - cx2) + (z - cz2) * (z - cz2);
        if (d < bestD) { bestD = d; bestI = i; bestT = t; }
      }
      var i0 = bestI, i1 = (i0 + 1) % M;
      var mx = px[i0] + (px[i1] - px[i0]) * bestT;
      var mz = pz[i0] + (pz[i1] - pz[i0]) * bestT;
      var nnx = nx[i0] + (nx[i1] - nx[i0]) * bestT;
      var nnz = nz[i0] + (nz[i1] - nz[i0]) * bestT;
      out.i = i0;
      out.s = sArr[i0] + (i1 === 0 ? (L - sArr[i0]) : (sArr[i1] - sArr[i0])) * bestT;
      if (i1 === 0) out.s = sArr[i0] + (L - sArr[i0]) * bestT;
      if (out.s >= L) out.s -= L;
      out.lat = (x - mx) * nnx + (z - mz) * nnz;
      out.half = half[i0] + (half[i1] - half[i0]) * bestT;
      out.dist = Math.sqrt(bestD);
      return out;
    };
    /* grid positions behind start line */
    track.startGrid = function (count) {
      var res = [];
      var rows = Math.ceil(count / 2);
      for (var n = 0; n < count; n++) {
        var row = Math.floor(n / 2), side = (n % 2 === 0) ? -1 : 1;
        var s = -(6 + row * 7.5);
        var lat = side * Math.min(3.6, half[0] * 0.35) * (1 + 0.15 * row);
        res.push({ s: s, lat: lat });
      }
      return res;
    };
    return track;
  }

  /* validation used by the automated tests */
  function validate(track, opts) {
    opts = opts || {};
    var problems = [];
    var minR = Infinity, maxSlope = 0;
    for (var i = 0; i < track.M; i++) {
      var k = track.k[i];
      if (Math.abs(k) > 1e-6) minR = Math.min(minR, 1 / Math.abs(k));
      var j = (i + 1) % track.M;
      var d = Math.hypot(track.px[j] - track.px[i], track.pz[j] - track.pz[i]);
      var dy = Math.abs(track.py[j] - track.py[i]);
      maxSlope = Math.max(maxSlope, d > 0.01 ? dy / d : 0);
    }
    if (minR < (opts.minRadius || 24)) problems.push('corner radius too tight: ' + minR.toFixed(1) + 'm');
    if (maxSlope > 0.22) problems.push('slope too steep: ' + (maxSlope * 100).toFixed(1) + '%');

    /* self-intersection / too-close-beside check */
    var minSelf = Infinity, minPair = null;
    var step = Math.max(1, Math.round(track.M / 220));
    for (var a = 0; a < track.M; a += step) {
      for (var b = a + step; b < track.M; b += step) {
        var gap = Math.min(Math.abs(a - b), track.M - Math.abs(a - b)) * track.spacing;
        if (gap < 90) continue;
        var dd = Math.hypot(track.px[b] - track.px[a], track.pz[b] - track.pz[a]);
        if (dd < minSelf) { minSelf = dd; minPair = [a, b]; }
      }
    }
    if (minSelf < (opts.minSeparation || track.def.width + 26)) {
      problems.push('track passes too close to itself: ' + minSelf.toFixed(1) + 'm at samples ' + minPair);
    }
    return { ok: problems.length === 0, problems: problems, minRadius: minR, maxSlope: maxSlope, minSelf: minSelf, length: track.length };
  }

  NR.TRACKS = TRACKS;
  NR.buildTrack = buildTrack;
  NR.validateTrack = validate;
  NR.trackById = function (id) {
    for (var i = 0; i < TRACKS.length; i++) if (TRACKS[i].id === id) return TRACKS[i];
    return TRACKS[0];
  };
})();

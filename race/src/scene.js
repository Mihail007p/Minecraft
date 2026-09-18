/* NITRO RUSH — world building: track meshes, scenery, sky, cars, effects */
(function () {
  'use strict';
  var NR = (window.NR = window.NR || {});
  var U = NR.U;

  /* ==================================================================
     geometry helpers (no external merge utility in the UMD build)
     ================================================================== */
  var _m4 = null, _v3 = null;
  function m4() { return _m4 || (_m4 = new THREE.Matrix4()); }
  function v3(x, y, z) { return (_v3 || (_v3 = new THREE.Vector3())).set(x, y, z); }

  function colorOf(hex) {
    var c = new THREE.Color();
    c.setHex(hex);
    return c;
  }

  /* merge a list of {geo, matrix, color} into one geometry with vertex colours */
  function mergeParts(parts) {
    var total = 0, i, g;
    for (i = 0; i < parts.length; i++) {
      g = parts[i].geo;
      parts[i]._pos = g.attributes.position.array;
      parts[i]._idx = g.index ? g.index.array : null;
      parts[i]._count = g.attributes.position.count;
      total += parts[i]._count;
    }
    var pos = new Float32Array(total * 3);
    var nrm = new Float32Array(total * 3);
    var col = new Float32Array(total * 3);
    var idx = [];
    var vOff = 0;
    var mat = new THREE.Matrix3();
    var p = new THREE.Vector3(), n = new THREE.Vector3();
    var geoIn = parts.length ? parts[0].geo : new THREE.BufferGeometry();
    var hasNormals = !!geoIn.attributes.normal;
    for (i = 0; i < parts.length; i++) {
      var part = parts[i];
      var src = part._pos;
      var nx = part.geo.attributes.normal ? part.geo.attributes.normal.array : null;
      mat.getNormalMatrix(part.matrix || m4().identity());
      var c = part.color != null ? colorOf(part.color) : null;
      for (var v = 0; v < part._count; v++) {
        p.set(src[v * 3], src[v * 3 + 1], src[v * 3 + 2]);
        if (part.matrix) p.applyMatrix4(part.matrix);
        pos[(vOff + v) * 3] = p.x; pos[(vOff + v) * 3 + 1] = p.y; pos[(vOff + v) * 3 + 2] = p.z;
        if (nx) {
          n.set(nx[v * 3], nx[v * 3 + 1], nx[v * 3 + 2]);
          if (part.matrix) n.applyMatrix3(mat).normalize();
          nrm[(vOff + v) * 3] = n.x; nrm[(vOff + v) * 3 + 1] = n.y; nrm[(vOff + v) * 3 + 2] = n.z;
        }
        if (c) {
          col[(vOff + v) * 3] = c.r; col[(vOff + v) * 3 + 1] = c.g; col[(vOff + v) * 3 + 2] = c.b;
        }
      }
      if (part._idx) {
        for (var k = 0; k < part._idx.length; k++) idx.push(part._idx[k] + vOff);
      } else {
        for (var q = 0; q < part._count; q++) idx.push(vOff + q);
      }
      vOff += part._count;
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    if (parts.some(function (x) { return x.color != null; })) {
      out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    out.setIndex(idx);
    return out;
  }

  /* ribbon geometry along the centreline: offset from `from` to `to` metres,
     optional vertical offset and per-point colour function */
  function ribbon(tr, from, to, yOff, colorFn, step) {
    step = step || 1;
    var pos = [], col = [], idx = [];
    var n = 0;
    for (var i = 0; i <= tr.M; i += step) {
      var j = i % tr.M;
      var hw = tr.half[j];
      var f = hw * from, t2 = hw * to;
      var y = tr.py[j] + (yOff || 0);
      var xa = tr.px[j] + tr.nx[j] * f, za = tr.pz[j] + tr.nz[j] * f;
      var xb = tr.px[j] + tr.nx[j] * t2, zb = tr.pz[j] + tr.nz[j] * t2;
      pos.push(xa, y, za, xb, y, zb);
      var c = colorFn ? colorFn(i % tr.M, j) : null;
      var cc = c != null ? colorOf(c) : null;
      if (cc) { col.push(cc.r, cc.g, cc.b, cc.r, cc.g, cc.b); }
      if (i > 0) {
        var a = (n - 1) * 2, b = a + 1, cx = n * 2, d = cx + 1;
        idx.push(a, b, d, a, d, cx);
      }
      n++;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /* ==================================================================
     theme configuration
     ================================================================== */
  var THEMES = {
    city: {
      road: 0x2b2f36, roadLine: 0xf2f2ef, kerbA: 0xe8e8e8, kerbB: 0xc22a2a,
      ground: 0x23262c, fog: 0x0b0f18, sky: [0x0a1030, 0x2a2350],
      sun: 0xffd9a0, sunDir: [-0.4, 0.35, -0.6], ambient: 0x2b3550, dir: 0x8899cc, dirI: 0.75,
      night: true, rain: false, props: 'city', lampColor: 0xffe9b0, lampEvery: 46
    },
    coast: {
      road: 0x35383d, roadLine: 0xf7f3e0, kerbA: 0xf0f0f0, kerbB: 0x2f6fd0,
      ground: 0xd9c48c, fog: 0x9fc6e8, sky: [0x2a76c6, 0xf7c98b],
      sun: 0xfff0c0, sunDir: [0.5, 0.25, 0.7], ambient: 0x9fb4d0, dir: 0xffe0b0, dirI: 1.05,
      night: false, water: 0x1c72b8, props: 'coast', lampColor: 0xfff3d0, lampEvery: 0
    },
    mountain: {
      road: 0x3a3d42, roadLine: 0xf4f4ee, kerbA: 0xe6e6e6, kerbB: 0xd08a1e,
      ground: 0x4f6b3a, fog: 0xa8c4d8, sky: [0x3f7fc4, 0xcfe4f2],
      sun: 0xffffff, sunDir: [0.3, 0.5, 0.4], ambient: 0x8fa6bd, dir: 0xfff4d8, dirI: 1.0,
      night: false, props: 'mountain', lampColor: 0xfff0c0, lampEvery: 70
    },
    desert: {
      road: 0x44454a, roadLine: 0xfaf6e6, kerbA: 0xefefe6, kerbB: 0xd8d2c0,
      ground: 0xd7b177, fog: 0xe6cf9f, sky: [0x4a9fe0, 0xf6e0a8],
      sun: 0xfff6d8, sunDir: [0.2, 0.75, -0.5], ambient: 0xb3a67a, dir: 0xfff2d0, dirI: 1.15,
      night: false, props: 'desert', lampColor: 0xffe9b0, lampEvery: 0
    },
    industry: {
      road: 0x33363b, roadLine: 0xf0ede2, kerbA: 0xe4e4e4, kerbB: 0xd2a12a,
      ground: 0x585a55, fog: 0x8d949a, sky: [0x5f7585, 0xa9b6bd],
      sun: 0xf2f0e4, sunDir: [-0.5, 0.6, 0.3], ambient: 0x8a9099, dir: 0xd8d8cc, dirI: 0.95,
      night: false, props: 'industry', lampColor: 0xffeec0, lampEvery: 54
    },
    alpine: {
      road: 0x40434a, roadLine: 0xfbfbf6, kerbA: 0xf2f2f2, kerbB: 0x3a76c8,
      ground: 0xe9eef4, fog: 0xcfe0ec, sky: [0x22406e, 0xdfeaf2],
      sun: 0xfff6e0, sunDir: [-0.3, 0.5, -0.5], ambient: 0x9fb4c8, dir: 0xdfe8f5, dirI: 0.95,
      night: false, props: 'alpine', lampColor: 0xdff0ff, lampEvery: 60, ice: true
    }
  };

  /* ==================================================================
     sky dome (gradient shader, works with no textures)
     ================================================================== */
  function buildSky(theme, radius) {
    var mat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(theme.sky[0]) },
        bottom: { value: new THREE.Color(theme.sky[1]) },
        sunDir: { value: new THREE.Vector3(theme.sunDir[0], theme.sunDir[1], theme.sunDir[2]).normalize() },
        sunColor: { value: new THREE.Color(theme.sun) },
        night: { value: theme.night ? 1 : 0 }
      },
      vertexShader:
        'varying vec3 vDir;' +
        'void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 bottom; uniform vec3 sunColor; uniform vec3 sunDir; uniform float night;' +
        'varying vec3 vDir;' +
        'void main(){' +
        '  float h = clamp(vDir.y * 1.15 + 0.08, 0.0, 1.0);' +
        '  vec3 c = mix(bottom, top, pow(h, 0.55));' +
        '  float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);' +
        '  c += sunColor * (pow(d, 26.0) * 0.85 + pow(d, 5.0) * 0.12);' +
        '  if (night > 0.5) c += vec3(0.02, 0.03, 0.06) * (1.0 - h);' +
        '  gl_FragColor = vec4(c, 1.0);' +
        '}',
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    var mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -10;
    return mesh;
  }

  /* ==================================================================
     terrain: coarse grid that follows the track elevation
     ================================================================== */
  function buildTerrain(tr, theme, seed) {
    var rnd = U.rng(seed);
    var noise = U.makeNoise1(seed + 5);
    var noise2 = U.makeNoise1(seed + 9);
    /* bounding box */
    var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (var i = 0; i < tr.M; i++) {
      if (tr.px[i] < minX) minX = tr.px[i];
      if (tr.px[i] > maxX) maxX = tr.px[i];
      if (tr.pz[i] < minZ) minZ = tr.pz[i];
      if (tr.pz[i] > maxZ) maxZ = tr.pz[i];
    }
    var margin = 320;
    minX -= margin; maxX += margin; minZ -= margin; maxZ += margin;
    var size = Math.max(maxX - minX, maxZ - minZ);
    var N = 82;
    var cell = size / N;

    /* bucket the centreline for fast nearest lookups */
    var bucket = 60;
    var bx = Math.ceil(size / bucket) + 2;
    var buckets = new Array(bx * bx);
    function key(cx, cz) { return cz * bx + cx; }
    for (var s = 0; s < tr.M; s++) {
      var cx = Math.floor((tr.px[s] - minX) / bucket);
      var cz = Math.floor((tr.pz[s] - minZ) / bucket);
      for (var ox = -1; ox <= 1; ox++) {
        for (var oz = -1; oz <= 1; oz++) {
          var k = key(cx + ox, cz + oz);
          if (cx + ox < 0 || cz + oz < 0 || cx + ox >= bx || cz + oz >= bx) continue;
          (buckets[k] || (buckets[k] = [])).push(s);
        }
      }
    }

    var geo = new THREE.BufferGeometry();
    var verts = N + 1;
    var pos = new Float32Array(verts * verts * 3);
    var col = new Float32Array(verts * verts * 3);
    var colors = {
      city: [0x23262c, 0x2c3038, 0x1d2026],
      coast: [0xd9c48c, 0xe3d3a2, 0xc9b177],
      mountain: [0x4f6b3a, 0x5d7a44, 0x6e6452],
      desert: [0xd7b177, 0xe4c48f, 0xc79f66],
      industry: [0x585a55, 0x64665f, 0x4b4d49],
      alpine: [0xe9eef4, 0xdbe4ee, 0xcdd8e2]
    }[theme.props] || [0x556644, 0x667755, 0x445533];

    for (var gz = 0; gz < verts; gz++) {
      for (var gx = 0; gx < verts; gx++) {
        var wx = minX + gx * cell, wz = minZ + gz * cell;
        var cellX = Math.floor((wx - minX) / bucket), cellZ = Math.floor((wz - minZ) / bucket);
        var list = buckets[key(cellX, cellZ)];
        var best = Infinity, bestY = 0, bestI = 0;
        if (list) {
          for (var li = 0; li < list.length; li++) {
            var si = list[li];
            var dx = tr.px[si] - wx, dz = tr.pz[si] - wz;
            var d2 = dx * dx + dz * dz;
            if (d2 < best) { best = d2; bestY = tr.py[si]; bestI = si; }
          }
        }
        var d = Math.sqrt(best === Infinity ? 1e6 : best);
        var hw = tr.half[bestI] || 8;
        var flat = hw + 6;
        var blend = U.smoothstep(U.clamp01((d - flat) / 60));
        var hill = noise(wx * 0.004 + 11) * 26 + noise2(wz * 0.0035 - 5) * 22;
        var detail = noise(wx * 0.02 + wz * 0.021) * 1.6;
        /* keep the verge well below the tarmac so no triangle pokes through */
        var verge = -0.7 - 0.5 * U.clamp01(1 - d / Math.max(flat, 1));
        var y = bestY + verge + blend * (Math.abs(hill) * (theme.props === 'desert' ? 0.55 : 1) + 3.0 + detail);
        var o = (gz * verts + gx) * 3;
        pos[o] = wx; pos[o + 1] = y; pos[o + 2] = wz;
        var c = colorOf(colors[Math.floor(Math.abs(noise(wx * 0.01 + wz * 0.013) * 2.9)) % colors.length]);
        var shade = 0.9 + noise(wx * 0.03 + wz * 0.027) * 0.14;
        col[o] = c.r * shade; col[o + 1] = c.g * shade; col[o + 2] = c.b * shade;
      }
    }
    var idx = [];
    for (var z2 = 0; z2 < N; z2++) {
      for (var x2 = 0; x2 < N; x2++) {
        var a = z2 * verts + x2, b = a + 1, c2 = a + verts, d2 = c2 + 1;
        idx.push(a, c2, b, b, c2, d2);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    var mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = false;
    mesh.userData.bbox = { minX: minX, minZ: minZ, size: size, cell: cell, N: N, verts: verts, positions: pos };
    return mesh;
  }

  /* ==================================================================
     prop geometry builders (each returns a merged geometry, unit-ish size)
     ================================================================== */
  function propGeometry(kind, rnd, theme) {
    var parts = [];
    function box(w, h, d, x, y, z, color, ry) {
      var g = new THREE.BoxGeometry(w, h, d);
      var m = m4().makeRotationY(ry || 0);
      m.setPosition(x, y, z);
      parts.push({ geo: g, matrix: m.clone(), color: color });
    }
    if (kind === 'building') {
      var w = rnd.range(9, 22), d = rnd.range(9, 20), h = rnd.range(12, 58);
      var base = U.pickWeighted(rnd, [0x1d2129, 0x242a33, 0x2b2f38, 0x323844], function () { return 1; });
      box(w, h, d, 0, h / 2, 0, base);
      /* lit windows: thin emissive strips on the sides */
      var cols = [0xffd88a, 0x9fd8ff, 0xffb27a, 0xd8b0ff];
      var floors = Math.max(2, Math.floor(h / 4.4));
      for (var f = 0; f < floors; f++) {
        if (rnd.next() > 0.72) continue;
        var yy = 2.2 + f * 4.4;
        var c = cols[Math.floor(rnd.next() * cols.length)];
        box(w * 0.86, 0.5, 0.2, 0, yy, d / 2 + 0.08, c);
        box(w * 0.86, 0.5, 0.2, 0, yy, -d / 2 - 0.08, c);
        box(0.2, 0.5, d * 0.86, w / 2 + 0.08, yy, 0, c);
        box(0.2, 0.5, d * 0.86, -w / 2 - 0.08, yy, 0, c);
      }
      /* roof neon */
      if (rnd.next() < 0.35) {
        box(w * 0.5, 0.4, 0.4, 0, h + 2.4, 0, cols[Math.floor(rnd.next() * cols.length)]);
      }
    } else if (kind === 'palm') {
      var th = rnd.range(6, 11);
      box(0.55, th, 0.55, 0, th / 2, 0, 0x6b5334);
      for (var l = 0; l < 6; l++) {
        var ang = l / 6 * Math.PI * 2 + rnd.next() * 0.4;
        var g = new THREE.BoxGeometry(4.6, 0.22, 1.15);
        var mm = m4().makeRotationY(ang);
        var tilt = m4().makeRotationZ(-0.35 - rnd.next() * 0.25);
        mm.multiply(tilt);
        mm.setPosition(Math.cos(ang) * 2.0, th + 0.35, Math.sin(ang) * 2.0);
        parts.push({ geo: g, matrix: mm.clone(), color: 0x2f7a37 });
      }
    } else if (kind === 'pine') {
      var ph = rnd.range(5, 12);
      box(0.6, ph * 0.42, 0.6, 0, ph * 0.21, 0, 0x4a3a26);
      var c1 = new THREE.ConeGeometry(rnd.range(1.9, 3.0), ph * 0.7, 7);
      var mm2 = m4().makeTranslation(0, ph * 0.42 + ph * 0.32, 0);
      parts.push({ geo: c1, matrix: mm2.clone(), color: 0x24602c });
      var c2 = new THREE.ConeGeometry(rnd.range(1.2, 2.0), ph * 0.55, 7);
      var mm3 = m4().makeTranslation(0, ph * 0.42 + ph * 0.62, 0);
      parts.push({ geo: c2, matrix: mm3.clone(), color: 0x2c7034 });
      if (theme && theme.props === 'alpine') {
        var cap = new THREE.ConeGeometry(rnd.range(0.7, 1.2), ph * 0.22, 7);
        var mm4 = m4().makeTranslation(0, ph * 0.42 + ph * 0.9, 0);
        parts.push({ geo: cap, matrix: mm4.clone(), color: 0xf2f7fc });
      }
    } else if (kind === 'rock') {
      var rw = rnd.range(1.4, 5.5);
      var rh = rnd.range(1.0, 4.0);
      var rock = new THREE.DodecahedronGeometry(rw * 0.6, 0);
      var mmr = m4().makeRotationY(rnd.next() * 3);
      mmr.multiply(m4().makeRotationZ(rnd.next() * 0.6 - 0.3));
      mmr.setPosition(0, rh * 0.4, 0);
      parts.push({ geo: rock, matrix: mmr.clone(), color: theme && theme.props === 'desert' ? 0xc09a63 : 0x6d6a63 });
      var rock2 = new THREE.DodecahedronGeometry(rw * 0.42, 0);
      var mmr2 = m4().makeTranslation(rw * 0.5, rh * 0.2, rw * 0.3);
      parts.push({ geo: rock2, matrix: mmr2.clone(), color: theme && theme.props === 'desert' ? 0xb08a55 : 0x5f5c56 });
    } else if (kind === 'cactus') {
      var ch = rnd.range(3.4, 6.2);
      box(0.9, ch, 0.9, 0, ch / 2, 0, 0x3f7a3a);
      box(0.7, ch * 0.5, 0.7, 0.85, ch * 0.55, 0, 0x3f7a3a);
      box(0.7, ch * 0.5, 0.7, -0.85, ch * 0.45, 0, 0x3f7a3a);
    } else if (kind === 'container') {
      var cw = rnd.range(6, 12), cd = rnd.range(2.4, 2.8);
      var ccol = [0xb03a2e, 0x2f6f4f, 0x2b5c8a, 0xc98b21, 0x7a7a7a][Math.floor(rnd.next() * 5)];
      box(cw, 2.7, cd, 0, 1.35, 0, ccol);
      if (rnd.next() < 0.4) box(cw, 2.7, cd, 0, 4.05, 0, ccol === 0x7a7a7a ? 0xb03a2e : 0x7a7a7a);
    } else if (kind === 'warehouse') {
      var ww = rnd.range(16, 34), wd = rnd.range(12, 24), wh = rnd.range(6, 11);
      box(ww, wh, wd, 0, wh / 2, 0, 0x8a8f93);
      box(ww * 1.02, 0.5, wd * 1.02, 0, wh + 0.3, 0, 0x5c6165);
      for (var wi = 0; wi < 2; wi++) {
        box(0.4, 0.5, wd * 0.9, (wi ? 1 : -1) * ww / 2 - 0.2, wh * 0.7, 0, 0xd8f0ff);
      }
    } else if (kind === 'chimney') {
      var sh = rnd.range(16, 34);
      var cyl = new THREE.CylinderGeometry(rnd.range(1.6, 3.2), rnd.range(2.2, 3.8), sh, 9);
      var mmc = m4().makeTranslation(0, sh / 2, 0);
      parts.push({ geo: cyl, matrix: mmc.clone(), color: 0xa8a49c });
      box(0.8, sh * 0.6, 0.8, 3.2, sh * 0.3, 0, 0x8f8b84);
    } else if (kind === 'lamp') {
      var lh = 8.4;
      box(0.32, lh, 0.32, 0, lh / 2, 0, 0x3c4148);
      box(2.1, 0.26, 0.26, 1.05, lh, 0, 0x3c4148);
      box(0.9, 0.22, 0.5, 1.9, lh - 0.16, 0, theme ? theme.lampColor : 0xfff0c0);
    } else if (kind === 'snowbank') {
      var sb = new THREE.BoxGeometry(rnd.range(5, 12), rnd.range(1.2, 2.6), rnd.range(2.5, 5));
      var mms = m4().makeRotationY(rnd.next() * 1.4);
      mms.setPosition(0, 0.6, 0);
      parts.push({ geo: sb, matrix: mms.clone(), color: 0xf4f8fc });
    } else if (kind === 'billboard') {
      var bw2 = rnd.range(6, 11), bh = rnd.range(3.2, 5.0);
      box(0.5, 4.0, 0.5, -bw2 * 0.3, 2, 0, 0x555a60);
      box(0.5, 4.0, 0.5, bw2 * 0.3, 2, 0, 0x555a60);
      var bcol = [0xff2f6d, 0x2fd0ff, 0xffd400, 0x36ff8c, 0xff7a1a][Math.floor(rnd.next() * 5)];
      box(bw2, bh, 0.35, 0, 4.4 + bh / 2, 0, bcol);
    }
    return mergeParts(parts);
  }

  /* ==================================================================
     main track scene
     ================================================================== */
  function buildTrackScene(track, opts) {
    opts = opts || {};
    var theme = THEMES[track.theme] || THEMES.city;
    var quality = opts.quality || 'medium';
    var rnd = U.rng(1234 + track.def.ctrl.length * 7);
    var scene = new THREE.Scene();
    scene.fog = new THREE.Fog(theme.fog, 120, quality === 'low' ? 520 : (quality === 'high' ? 1050 : 800));

    /* --- lights --- */
    var hemi = new THREE.HemisphereLight(theme.sky[1], theme.ground, theme.night ? 0.55 : 0.85);
    scene.add(hemi);
    var ambient = new THREE.AmbientLight(theme.ambient, theme.night ? 0.5 : 0.35);
    scene.add(ambient);
    var dir = new THREE.DirectionalLight(theme.dir, theme.dirI);
    dir.position.set(theme.sunDir[0] * 200, theme.sunDir[1] * 200 + 60, theme.sunDir[2] * 200);
    scene.add(dir);

    scene.add(buildSky(theme, 1600));

    /* --- ground --- */
    var terrain = buildTerrain(track, theme, 4242);
    scene.add(terrain);

    /* --- road surface --- */
    var roadMat = new THREE.MeshLambertMaterial({ color: theme.road });
    var roadGeo = ribbon(track, -1, 1, 0.02, null, 1);
    var road = new THREE.Mesh(roadGeo, roadMat);
    scene.add(road);

    /* shoulder (dirt/gravel) */
    var shoulderMat = new THREE.MeshLambertMaterial({ color: U.shade(theme.ground, -0.25) });
    var shoulder = new THREE.Mesh(ribbon(track, -1.35, -1.0, -0.02, null, 2), shoulderMat);
    var shoulder2 = new THREE.Mesh(ribbon(track, 1.0, 1.35, -0.02, null, 2), shoulderMat);
    scene.add(shoulder); scene.add(shoulder2);

    /* --- markings: edge lines + centre dashes --- */
    var lineMat = new THREE.MeshBasicMaterial({ color: theme.roadLine, fog: true });
    var edgeL = new THREE.Mesh(ribbon(track, -0.955, -0.895, 0.04, null, 2), lineMat);
    var edgeR = new THREE.Mesh(ribbon(track, 0.895, 0.955, 0.04, null, 2), lineMat);
    scene.add(edgeL); scene.add(edgeR);

    var dashParts = [];
    var dashGeo = new THREE.PlaneGeometry(0.34, 3.2);
    dashGeo.rotateX(-Math.PI / 2);
    var dashStep = Math.max(2, Math.round(12 / track.spacing));
    for (var i = 0; i < track.M; i += dashStep) {
      var p = track.posAt(track.s[i] + 1.6, 0, {});
      var m = m4().makeRotationY(Math.atan2(p.tx, p.tz));
      m.setPosition(p.x, p.y + 0.05, p.z);
      dashParts.push({ geo: dashGeo, matrix: m.clone(), color: null });
    }
    var dashes = new THREE.Mesh(mergeParts(dashParts), lineMat);
    scene.add(dashes);

    /* --- kerbs where the track bends --- */
    var kerbParts = [];
    var kerbGeoW = new THREE.PlaneGeometry(1.4, track.spacing * 2.05);
    kerbGeoW.rotateX(-Math.PI / 2);
    var flip = 0;
    for (var k = 0; k < track.M; k += 2) {
      var cur = Math.abs(track.k[k]);
      if (cur < 1 / 130) continue;
      var side = track.k[k] > 0 ? 1 : -1;
      var q = track.posAt(track.s[k] + track.spacing, 0, {});
      var mm = m4().makeRotationY(Math.atan2(q.tx, q.tz));
      mm.setPosition(q.x + track.nx[k] * side * (track.half[k] * 1.03), q.y + 0.045, q.z + track.nz[k] * side * (track.half[k] * 1.03));
      kerbParts.push({ geo: kerbGeoW, matrix: mm.clone(), color: (k % 4 === 0) ? theme.kerbA : theme.kerbB });
    }
    if (kerbParts.length) scene.add(new THREE.Mesh(mergeParts(kerbParts), new THREE.MeshLambertMaterial({ vertexColors: true })));

    /* --- barriers --- */
    var wallParts = [];
    var wallH = 0.85;
    var postEvery = Math.max(1, Math.round(10 / track.spacing));
    var wallGeo = new THREE.BoxGeometry(0.34, wallH, track.spacing * 1.05);
    for (var w2 = 0; w2 < track.M; w2++) {
      for (var side2 = -1; side2 <= 1; side2 += 2) {
        var wp = track.posAt(track.s[w2], 0, {});
        var lat = side2 * (track.half[w2] + 0.6);
        var mx = wp.x + track.nx[w2] * lat, mz = wp.z + track.nz[w2] * lat;
        var mmw = m4().makeRotationY(Math.atan2(wp.tx, wp.tz));
        mmw.setPosition(mx, wp.y + wallH / 2 - 0.1, mz);
        var colr = (w2 % postEvery === 0) ? theme.kerbA : (side2 > 0 ? 0xd8d8d8 : 0xc8c8c8);
        if (track.theme === 'city' || track.theme === 'industry') colr = (w2 % postEvery === 0) ? 0xb8bcc4 : 0x6f757e;
        wallParts.push({ geo: wallGeo, matrix: mmw.clone(), color: colr });
      }
    }
    var walls = new THREE.Mesh(mergeParts(wallParts), new THREE.MeshLambertMaterial({ vertexColors: true }));
    scene.add(walls);

    /* --- ramps --- */
    var rampParts = [];
    for (var ri = 0; ri < track.ramps.length; ri++) {
      var R = track.ramps[ri];
      var h = R.height * R.dir;
      var wedge = new THREE.BufferGeometry();
      var hw = R.half, hl = R.len / 2;
      var vp = [
        -hw, 0, -hl, hw, 0, -hl, hw, 0, hl, -hw, 0, hl,
        -hw, h, hl, hw, h, hl
      ];
      var vIdx = [
        0, 1, 5, 0, 5, 4,      /* sloped top */
        0, 4, 3, 3, 4, 4,
        1, 2, 5, 5, 2, 2,
        0, 1, 2, 0, 2, 3,      /* bottom */
        3, 2, 5, 3, 5, 4       /* back */
      ];
      wedge.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
      wedge.setIndex(vIdx);
      wedge.computeVertexNormals();
      var rm = m4().makeRotationY(Math.atan2(R.tx, R.tz));
      rm.setPosition(R.x, R.y + 0.02, R.z);
      rampParts.push({ geo: wedge, matrix: rm.clone(), color: 0x2f3238 });
      var sr = m4().makeRotationY(Math.atan2(R.tx, R.tz));
      sr.setPosition(R.x, R.y + 0.03, R.z);
      var strip = new THREE.BoxGeometry(hw * 1.9, 0.06, 1.1);
      var sr2 = m4().makeRotationY(Math.atan2(R.tx, R.tz));
      sr2.setPosition(R.x + R.tx * (R.len * 0.5 - 0.6), R.y + R.height * R.dir, R.z + R.tz * (R.len * 0.5 - 0.6));
      rampParts.push({ geo: strip, matrix: sr2.clone(), color: 0xffc020 });
    }
    if (rampParts.length) {
      var rampsMesh = new THREE.Mesh(mergeParts(rampParts), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      scene.add(rampsMesh);
    }

    /* --- gates (sponsor arches) --- */
    var gateParts = [];
    for (var gi = 0; gi < track.gates.length; gi++) {
      var G = track.gates[gi];
      var gh = 7.2;
      var ghalf = G.half + 1.1;
      var post = new THREE.BoxGeometry(0.7, gh, 0.7);
      for (var gs = -1; gs <= 1; gs += 2) {
        var gm = m4().makeRotationY(Math.atan2(track.tx[G.i], track.tz[G.i]));
        var px2 = G.x + track.nx[G.i] * gs * ghalf;
        var pz2 = G.z + track.nz[G.i] * gs * ghalf;
        gm.setPosition(px2, G.y + gh / 2, pz2);
        gateParts.push({ geo: post, matrix: gm.clone(), color: 0x30343c });
      }
      var beam = new THREE.BoxGeometry(ghalf * 2 + 1.4, 1.5, 0.5);
      var bm = m4().makeRotationY(Math.atan2(track.tx[G.i], track.tz[G.i]));
      bm.setPosition(G.x, G.y + gh + 0.4, G.z);
      var gcol = [0xff2f6d, 0x2fd0ff, 0xffd400, 0x36ff8c][gi % 4];
      gateParts.push({ geo: beam, matrix: bm.clone(), color: gcol });
      /* small checkered blocks under the beam */
      for (var cb = -3; cb <= 3; cb++) {
        var block = new THREE.BoxGeometry(1.0, 0.5, 0.5);
        var cbm = m4().makeRotationY(Math.atan2(track.tx[G.i], track.tz[G.i]));
        cbm.setPosition(G.x + track.nx[G.i] * cb * 1.25, G.y + gh - 0.5, G.z + track.nz[G.i] * cb * 1.25);
        gateParts.push({ geo: block, matrix: cbm.clone(), color: cb % 2 ? 0xffffff : 0x151515 });
      }
    }
    if (gateParts.length) scene.add(new THREE.Mesh(mergeParts(gateParts), new THREE.MeshLambertMaterial({ vertexColors: true })));

    /* --- start / finish line + gantry --- */
    (function buildStart() {
      var parts = [];
      var tiles = 14;
      var half = track.half[0];
      for (var r = 0; r < 2; r++) {
        for (var c = 0; c < tiles; c++) {
          var tile = new THREE.PlaneGeometry(half * 2 / tiles, 0.9);
          tile.rotateX(-Math.PI / 2);
          var lat = -half + (c + 0.5) * (half * 2 / tiles);
          var mm = m4().makeRotationY(Math.atan2(track.tx[0], track.tz[0]));
          mm.multiply(m4().makeRotationZ(0));
          var q = track.posAt(-0.6 + r * 0.9, lat, {});
          mm.setPosition(q.x, q.y + 0.05, q.z);
          parts.push({ geo: tile, matrix: mm.clone(), color: (r + c) % 2 ? 0xffffff : 0x101010 });
        }
      }
      var gh2 = 8.4, ghalf2 = half + 1.6;
      var post2 = new THREE.BoxGeometry(1.0, gh2, 1.0);
      for (var s2 = -1; s2 <= 1; s2 += 2) {
        var pm = m4().makeRotationY(Math.atan2(track.tx[0], track.tz[0]));
        var q2 = track.posAt(0, s2 * ghalf2, {});
        pm.setPosition(q2.x, q2.y + gh2 / 2, q2.z);
        parts.push({ geo: post2, matrix: pm.clone(), color: 0x1b1f26 });
      }
      var beam2 = new THREE.BoxGeometry(ghalf2 * 2 + 2.2, 2.6, 0.7);
      var q3 = track.posAt(0, 0, {});
      var bm2 = m4().makeRotationY(Math.atan2(track.tx[0], track.tz[0]));
      bm2.setPosition(q3.x, q3.y + gh2 + 0.7, q3.z);
      parts.push({ geo: beam2, matrix: bm2.clone(), color: 0x0f1218 });
      var banner = new THREE.BoxGeometry(ghalf2 * 1.3, 1.5, 0.2);
      var bm3 = m4().makeRotationY(Math.atan2(track.tx[0], track.tz[0]));
      bm3.setPosition(q3.x, q3.y + gh2 + 0.5, q3.z + 0.5);
      parts.push({ geo: banner, matrix: bm3.clone(), color: 0xff2f6d });
      var mel = new THREE.Mesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
      scene.add(mel);
    })();

    /* --- scenery props (instanced) --- */
    var propCounts = {
      low: { city: 90, coast: 80, mountain: 85, desert: 70, industry: 80, alpine: 85 },
      medium: { city: 180, coast: 150, mountain: 160, desert: 130, industry: 150, alpine: 160 },
      high: { city: 280, coast: 230, mountain: 240, desert: 200, industry: 220, alpine: 240 }
    };
    var count = (propCounts[quality] || propCounts.medium)[theme.props] || 200;
    var kinds = {
      city: ['building', 'building', 'building', 'billboard', 'lamp'],
      coast: ['palm', 'palm', 'rock', 'billboard'],
      mountain: ['pine', 'pine', 'rock', 'rock'],
      desert: ['rock', 'rock', 'cactus', 'cactus'],
      industry: ['warehouse', 'container', 'container', 'chimney', 'billboard'],
      alpine: ['pine', 'pine', 'snowbank', 'rock']
    }[theme.props] || ['rock'];

    /* pick placements: walk the centreline, offset outward, skip the roadway */
    var placements = [];
    var arcStep = quality === 'low' ? 26 : quality === 'medium' ? 17 : 12;
    var keepChance = quality === 'low' ? 0.5 : quality === 'medium' ? 0.68 : 0.85;
    var total = track.length;
    for (var sPos = 0; sPos < total && placements.length < count * 4; sPos += arcStep) {
      var idxA = track.indexAtS(sPos);
      if (rnd.next() > keepChance) continue;
      var lat = (rnd.next() < 0.5 ? -1 : 1) * (track.half[idxA] + rnd.range(9, 130));
      var q4 = track.posAt(sPos, lat, {});
      placements.push({ x: q4.x, z: q4.z, y: q4.y });
    }
    /* lamps follow the road edge exactly */
    if (theme.lampEvery) {
      for (var sL = 0; sL < total; sL += theme.lampEvery) {
        var iL = track.indexAtS(sL);
        var sideL = (Math.floor(sL / theme.lampEvery) % 2) ? 1 : -1;
        var qL = track.posAt(sL, sideL * (track.half[iL] + 1.5), {});
        placements.push({ x: qL.x, z: qL.z, y: qL.y, forceKind: 'lamp', flip: sideL });
      }
    }

    var scene2 = scene;
    var dummy = new THREE.Object3D();
    for (var ki = 0; ki < kinds.length; ki++) {
      var kind = kinds[ki];
      /* each kind takes a deterministic share of the placements */
      var list = [];
      for (var pi2 = 0; pi2 < placements.length; pi2++) {
        var pl2 = placements[pi2];
        if (pl2.forceKind === 'lamp') { if (kind === 'lamp') list.push(pl2); continue; }
        if (kind === 'lamp') continue;
        var hh = Math.abs(Math.sin(pi2 * 12.9898 + ki * 78.233) * 43758.5453) % 1;
        if (hh < 1 / kinds.length) list.push(pl2);
      }
      if (!list.length) continue;
      var proto = propGeometry(kind, U.rng(999 + ki * 17), theme);
      var mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      var inst = new THREE.InstancedMesh(proto, mat, list.length);
      inst.frustumCulled = true;
      for (var ii = 0; ii < list.length; ii++) {
        var P = list[ii];
        var scale = kind === 'lamp' ? 1 : (kind === 'snowbank' ? 1 : U.lerp(0.75, 1.5, U.rng(ii * 7 + ki).next()));
        dummy.position.set(P.x, P.y - 0.05, P.z);
        dummy.rotation.set(0, (kind === 'lamp' ? (P.flip > 0 ? Math.PI : 0) : U.rng(ii * 3 + 1).next() * Math.PI * 2), 0);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        inst.setMatrixAt(ii, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      scene2.add(inst);
    }

    /* --- theme extras: water for the coast, ice patches for alpine --- */
    if (theme.water != null) {
      var wplane = new THREE.Mesh(
        new THREE.PlaneGeometry(3600, 3600),
        new THREE.MeshLambertMaterial({ color: theme.water, transparent: true, opacity: 0.94 })
      );
      wplane.rotation.x = -Math.PI / 2;
      wplane.position.y = track.py[0] - 26;
      scene.add(wplane);
    }
    if (theme.ice) {
      var iceParts = [];
      var iceGeo = new THREE.PlaneGeometry(3.4, 5.2);
      iceGeo.rotateX(-Math.PI / 2);
      for (var ii2 = 0; ii2 < track.M; ii2 += 3) {
        if (track.k[ii2] > -1 / 90) continue;
        var q5 = track.posAt(track.s[ii2], track.half[ii2] * 0.35, {});
        var im = m4().makeRotationY(Math.atan2(track.tx[ii2], track.tz[ii2]));
        im.setPosition(q5.x, q5.y + 0.06, q5.z);
        iceParts.push({ geo: iceGeo, matrix: im.clone(), color: 0xbfe4ff });
      }
      if (iceParts.length) {
        var iceMesh = new THREE.Mesh(mergeParts(iceParts),
          new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55 }));
        scene.add(iceMesh);
      }
    }

    /* --- lights at night: fake glow sprites along the road --- */
    if (theme.night) {
      var glowParts = [];
      for (var gi2 = 0; gi2 < track.M; gi2 += Math.max(1, Math.round(24 / track.spacing))) {
        var side3 = (gi2 % 2) ? 1 : -1;
        var q6 = track.posAt(track.s[gi2], side3 * (track.half[gi2] + 1.2), {});
        for (var gk = 0; gk < 2; gk++) {
          var gpos = [0, 0, 0];
          var sg = new THREE.PlaneGeometry(2.6, 2.6);
          var gm2 = m4().makeTranslation(q6.x + track.nx[gi2] * side3 * 1.2, q6.y + 0.3 + gk * 0.05, q6.z + track.nz[gi2] * side3 * 1.2);
          glowParts.push({ geo: sg, matrix: gm2.clone(), color: gk ? 0x6a7fd8 : 0x2a2f6a });
        }
      }
      var glow = new THREE.Mesh(mergeParts(glowParts), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false }));
      glow.renderOrder = 2;
      scene.add(glow);
    }

    scene.userData = {
      theme: theme, track: track, quality: quality,
      road: road, terrain: terrain, walls: walls, meshes: scene.children.length
    };
    return scene;
  }

  /* ==================================================================
     car visual
     ================================================================== */
  function CarVisual(carDef, colors) {
    this.group = NR.CarFactory.buildCarMesh(carDef.style, colors);
    this.style = this.group.userData.style;
    this.wheels = this.group.userData.wheels;
    this.flames = this.group.userData.flames;
    this.materials = this.group.userData.materials;
    this.brakeOn = false;
    this.tilt = new THREE.Group();
  }

  CarVisual.prototype.update = function (car, dt) {
    var g = this.group;
    g.position.set(car.x, car.y, car.z);
    g.rotation.set(0, 0, 0);
    g.rotation.y = car.heading;
    var pitch = U.clamp(car.pitchAngle, -0.2, 0.2);
    var roll = U.clamp(car.rollAngle, -0.25, 0.25);
    g.rotateX(pitch);
    g.rotateZ(roll);
    /* wheels: spin + steer */
    for (var i = 0; i < this.wheels.length; i++) {
      var w = this.wheels[i];
      w.rotation.x = car.wheelSpin;
      var isFront = (i === 0 || i === 1);
      w.rotation.y = isFront ? car.wheelSteer : 0;
      /* suspension travel */
      var bump = car.airborne ? 0.10 : 0;
      w.position.y = this.style.wheelR - bump * (isFront ? 1 : -1) + (car.airborne ? 0.05 : 0);
    }
    /* nitro flames */
    var active = car.nitroActive;
    for (var f = 0; f < this.flames.length; f++) {
      var fl = this.flames[f];
      fl.visible = active;
      if (active) {
        var s = 0.8 + Math.random() * 0.7;
        fl.scale.set(s, s * (0.7 + Math.random() * 0.8), s);
      }
    }
    /* brake lights */
    var braking = car.u !== undefined && car.brakeVisual > 0.4;
    if (this.materials && this.brakeOn !== braking) {
      this.brakeOn = braking;
      this.materials.tail.color.setHex(braking ? 0xff5555 : 0x551111);
    }
    /* damage: darken + tilt when wrecked */
    if (car.damage > 40 && this.materials) {
      var d = U.clamp01((car.damage - 40) / 60);
      this.materials.body.color.setHex(U.shade(this.baseColor || 0xd11f2f, -0.35 * d));
    }
  };

  /* ==================================================================
     effects: skid marks, particles
     ================================================================== */
  function SkidMarks(scene, max) {
    this.max = max || 420;
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(this.max * 6 * 3);
    var col = new Float32Array(this.max * 6 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.pos = pos;
    this.col = col;
    this.head = 0;
    this.count = 0;
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }));
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  SkidMarks.prototype.pushSegment = function (ax, ay, az, bx, by, bz, cx, cy, cz, dx2, dy2, dz2) {
    var i = this.head % this.max;
    var o = i * 18;
    var p = this.pos;
    p[o] = ax; p[o + 1] = ay; p[o + 2] = az;
    p[o + 3] = bx; p[o + 4] = by; p[o + 5] = bz;
    p[o + 6] = cx; p[o + 7] = cy; p[o + 8] = cz;
    p[o + 9] = bx; p[o + 10] = by; p[o + 11] = bz;
    p[o + 12] = dx2; p[o + 13] = dy2; p[o + 14] = dz2;
    p[o + 15] = cx; p[o + 16] = cy; p[o + 17] = cz;
    for (var k = 0; k < 6; k++) {
      this.col[o + k * 3] = 0.06;
      this.col[o + k * 3 + 1] = 0.06;
      this.col[o + k * 3 + 2] = 0.07;
    }
    this.head++;
    this.count = Math.min(this.count + 1, this.max);
    this.geo.setDrawRange(0, this.count * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  };

  /* lightweight particle pool (Points with per-particle colour/size) */
  function Particles(scene, max) {
    this.max = max || 260;
    var geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.max * 3);
    this.colors = new Float32Array(this.max * 3);
    this.sizes = new Float32Array(this.max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setDrawRange(0, 0);
    var mat = new THREE.PointsMaterial({
      size: 1.0, vertexColors: true, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.geo = geo;
    this.active = 0;
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    scene.add(this.points);
  }

  Particles.prototype.emit = function (x, y, z, vx, vy, vz, r, g, b, life) {
    var i = this.active < this.max ? this.active++ : (Math.random() * this.max) | 0;
    this.positions[i * 3] = x; this.positions[i * 3 + 1] = y; this.positions[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.colors[i * 3] = r; this.colors[i * 3 + 1] = g; this.colors[i * 3 + 2] = b;
    this.life[i] = life || 0.7;
  };

  Particles.prototype.update = function (dt) {
    var i = 0;
    while (i < this.active) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        var last = --this.active;
        if (last !== i) {
          this.positions[i * 3] = this.positions[last * 3];
          this.positions[i * 3 + 1] = this.positions[last * 3 + 1];
          this.positions[i * 3 + 2] = this.positions[last * 3 + 2];
          this.vel[i * 3] = this.vel[last * 3];
          this.vel[i * 3 + 1] = this.vel[last * 3 + 1];
          this.vel[i * 3 + 2] = this.vel[last * 3 + 2];
          this.colors[i * 3] = this.colors[last * 3];
          this.colors[i * 3 + 1] = this.colors[last * 3 + 1];
          this.colors[i * 3 + 2] = this.colors[last * 3 + 2];
          this.life[i] = this.life[last];
        }
        continue;                       /* slot i now holds another particle */
      }
      this.positions[i * 3] += this.vel[i * 3] * dt;
      this.positions[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] -= 7 * dt;
      this.colors[i * 3] *= 0.995;
      this.colors[i * 3 + 1] *= 0.99;
      this.colors[i * 3 + 2] *= 0.985;
      i++;
    }
    this.geo.setDrawRange(0, this.active);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  };

  NR.SceneKit = {
    THEMES: THEMES,
    buildTrackScene: buildTrackScene,
    buildSky: buildSky,
    buildTerrain: buildTerrain,
    propGeometry: propGeometry,
    mergeParts: mergeParts,
    ribbon: ribbon,
    CarVisual: CarVisual,
    SkidMarks: SkidMarks,
    Particles: Particles
  };
})();

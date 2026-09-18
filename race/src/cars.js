/* NITRO RUSH — car catalogue + procedural low-poly car meshes */
(function () {
  'use strict';
  var NR = (window.NR = window.NR || {});
  var U = NR.U;

  /* ------------------------------------------------------------------
     Body styles: lofted hulls defined by cross sections along the car.
     Each section: { z: position along length (-1 rear .. +1 front),
                     w: half width, yb: bottom y, yt: top y,
                     r: corner rounding of the top edge }
     ------------------------------------------------------------------ */

  function section(z, w, yb, yt, r) { return { z: z, w: w, yb: yb, yt: yt, r: r || 0.18 }; }

  var STYLES = {
    /* low, wide GT car with a long nose */
    gt: {
      name: 'GT',
      sections: [
        section(-1.00, 0.42, 0.30, 0.62, 0.10),
        section(-0.88, 0.58, 0.22, 0.86, 0.16),
        section(-0.55, 0.66, 0.20, 0.98, 0.20),
        section(-0.15, 0.68, 0.19, 0.92, 0.22),
        section(0.18, 0.66, 0.18, 0.74, 0.22),
        section(0.55, 0.62, 0.18, 0.62, 0.24),
        section(0.86, 0.50, 0.22, 0.56, 0.18),
        section(1.00, 0.34, 0.28, 0.52, 0.12)
      ],
      cabin: [-0.52, -0.05, 0.46, 0.30, 1.10],
      wheelbase: 2.55, frontZ: 1.35, rearZ: -1.30, wheelR: 0.35, wheelW: 0.26, track: 0.72,
      wing: { z: -1.02, y: 0.98, w: 0.66, h: 0.07, d: 0.22, stands: true },
      exhausts: [[-0.22, 0.28, -1.02], [0.22, 0.28, -1.02]],
      scale: 1.0
    },
    /* wide muscular coupe, high beltline */
    muscle: {
      name: 'Маскл',
      sections: [
        section(-1.00, 0.46, 0.32, 0.74, 0.10),
        section(-0.86, 0.62, 0.24, 0.96, 0.16),
        section(-0.52, 0.70, 0.22, 1.04, 0.18),
        section(-0.12, 0.71, 0.21, 0.98, 0.22),
        section(0.22, 0.70, 0.20, 0.86, 0.22),
        section(0.58, 0.66, 0.20, 0.78, 0.22),
        section(0.88, 0.54, 0.24, 0.70, 0.18),
        section(1.00, 0.38, 0.30, 0.64, 0.12)
      ],
      cabin: [-0.50, -0.02, 0.52, 0.34, 1.14],
      wheelbase: 2.72, frontZ: 1.40, rearZ: -1.35, wheelR: 0.38, wheelW: 0.30, track: 0.74,
      wing: { z: -1.00, y: 0.94, w: 0.70, h: 0.06, d: 0.18, stands: true },
      exhausts: [[-0.26, 0.30, -1.00], [0.26, 0.30, -1.00]],
      scale: 1.04
    },
    /* very low hypercar, big rear wing */
    hyper: {
      name: 'Гипер',
      sections: [
        section(-1.00, 0.40, 0.26, 0.56, 0.08),
        section(-0.88, 0.60, 0.18, 0.84, 0.14),
        section(-0.55, 0.70, 0.16, 0.86, 0.18),
        section(-0.18, 0.70, 0.15, 0.76, 0.20),
        section(0.20, 0.68, 0.14, 0.60, 0.22),
        section(0.58, 0.62, 0.14, 0.50, 0.22),
        section(0.88, 0.48, 0.18, 0.46, 0.16),
        section(1.00, 0.30, 0.24, 0.44, 0.10)
      ],
      cabin: [-0.48, 0.02, 0.44, 0.26, 1.06],
      wheelbase: 2.62, frontZ: 1.32, rearZ: -1.28, wheelR: 0.34, wheelW: 0.28, track: 0.76,
      wing: { z: -1.04, y: 1.06, w: 0.78, h: 0.08, d: 0.26, stands: true },
      exhausts: [[0, 0.30, -1.05]],
      scale: 0.98
    },
    /* rally / roadster with a short tail */
    rally: {
      name: 'Ралли',
      sections: [
        section(-0.92, 0.50, 0.40, 0.86, 0.12),
        section(-0.80, 0.62, 0.34, 1.08, 0.16),
        section(-0.48, 0.68, 0.32, 1.16, 0.20),
        section(-0.10, 0.68, 0.31, 1.08, 0.22),
        section(0.24, 0.66, 0.30, 0.94, 0.22),
        section(0.58, 0.62, 0.30, 0.86, 0.22),
        section(0.86, 0.52, 0.34, 0.80, 0.18),
        section(1.00, 0.40, 0.38, 0.76, 0.14)
      ],
      cabin: [-0.46, 0.00, 0.54, 0.40, 1.20],
      wheelbase: 2.48, frontZ: 1.28, rearZ: -1.24, wheelR: 0.40, wheelW: 0.30, track: 0.72,
      wing: { z: -0.94, y: 1.16, w: 0.74, h: 0.07, d: 0.20, stands: true },
      exhausts: [[-0.24, 0.42, -0.94], [0.24, 0.42, -0.94]],
      scale: 1.06
    }
  };

  /* ------------------------------------------------------------------
     Loft geometry builder
     ------------------------------------------------------------------ */
  function buildHull(secs, opts) {
    opts = opts || {};
    var verts = [];
    var sidePts = 6;                       // points per half cross-section
    var ring = [];                         // ring templates

    for (var s = 0; s < secs.length; s++) {
      var sc = secs[s];
      var pts = [];
      // start at bottom center, go right side up and over to left (closed ring, CCW)
      var ys = sc.yt - sc.yb;
      var rr = Math.min(sc.r, sc.w * 0.9, ys * 0.9);
      // bottom (flat, 2 pts)
      pts.push([0, sc.yb]);
      pts.push([sc.w * 0.55, sc.yb + ys * 0.03]);
      pts.push([sc.w, sc.yb + ys * 0.22]);
      pts.push([sc.w, sc.yt - rr - ys * 0.06]);
      // rounded top shoulder
      for (var a = 0; a <= 3; a++) {
        var t = a / 3;
        var ang = (Math.PI * 0.5) * t;
        pts.push([sc.w - rr + rr * Math.cos(ang), sc.yt - rr + rr * Math.sin(ang)]);
      }
      // mirror left side
      var n = pts.length;
      for (var i = n - 2; i >= 0; i--) pts.push([-pts[i][0], pts[i][1]]);
      ring.push(pts);
    }

    var ringLen = ring[0].length;
    var faces = [];
    for (var s2 = 0; s2 < ring.length - 1; s2++) {
      for (var p = 0; p < ringLen; p++) {
        var p2 = (p + 1) % ringLen;
        faces.push([s2, p, s2, p2, s2 + 1, p2, s2 + 1, p]);
      }
    }
    // caps (fan from center of first/last ring)
    for (var p3 = 0; p3 < ringLen; p3++) {
      var q3 = (p3 + 1) % ringLen;
      faces.push([0, q3, 0, p3, -1, 0]);
      var L = ring.length - 1;
      faces.push([L, p3, L, q3, -1, 1]);
    }

    var pos = [];
    function pushSec(si, pi) {
      var sc = ring[si], pt = sc[pi] || [0, (secs[si].yb + secs[si].yt) / 2];
      pos.push(pt[0] * (opts.widen || 1), pt[1], secs[si].z * (opts.stretch || 1));
    }
    for (var f = 0; f < faces.length; f++) {
      var F = faces[f];
      if (F[4] === -1) {
        var capS = F[0], flip = F[5];
        var cx = 0, cy = (secs[capS].yb + secs[capS].yt) / 2;
        var a1 = [ring[capS][F[1]][0], ring[capS][F[1]][1]];
        var a2 = [ring[capS][F[2]][0], ring[capS][F[2]][1]];
        var tri = [[a1[0], a1[1]], [a2[0], a2[1]], [cx, cy]];
        if (flip === 0) tri.reverse();
        for (var t2 = 0; t2 < 3; t2++) pos.push(tri[t2][0] * (opts.widen || 1), tri[t2][1], secs[capS].z * (opts.stretch || 1));
      } else {
        pushSec(F[0], F[1]); pushSec(F[2], F[3]); pushSec(F[4], F[5]);
      }
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    var nonIndexed = geo;
    // merge coincident verts for smooth shading where appropriate happens naturally via normals;
    return nonIndexed;
  }

  /* ------------------------------------------------------------------
     Full car mesh
     ------------------------------------------------------------------ */
  function buildCarMesh(styleId, colors) {
    var style = STYLES[styleId] || STYLES.gt;
    colors = colors || {};
    var bodyHex = colors.body != null ? colors.body : 0xd11f2f;
    var accentHex = colors.accent != null ? colors.accent : 0x101418;
    var rimHex = colors.rim != null ? colors.rim : 0xd7dde6;

    var group = new THREE.Group();
    var bodyMat = new THREE.MeshPhongMaterial({ color: bodyHex, shininess: 70, specular: 0x888888, flatShading: false });
    var darkMat = new THREE.MeshLambertMaterial({ color: accentHex });
    var glassMat = new THREE.MeshPhongMaterial({ color: 0x0a1018, shininess: 110, specular: 0x555555, transparent: true, opacity: 0.86 });
    var rimMat = new THREE.MeshPhongMaterial({ color: rimHex, shininess: 60, specular: 0x666666 });
    var tyreMat = new THREE.MeshLambertMaterial({ color: 0x14161a });

    var hull = new THREE.Mesh(buildHull(style.sections), bodyMat);
    hull.castShadow = false; hull.receiveShadow = false;
    group.add(hull);

    /* cabin / greenhouse */
    var c = style.cabin;
    var cabHull = new THREE.Mesh(buildHull([
      section(c[0], c[2] * 0.55, c[3], c[3] + (c[4] - c[3]) * 0.55, 0.10),
      section(c[0] + (c[1] - c[0]) * 0.25, c[2] * 0.94, c[3], c[4], 0.16),
      section(c[1] - (c[1] - c[0]) * 0.3, c[2] * 0.92, c[3], c[4] * 0.97, 0.18),
      section(c[1], c[2] * 0.5, c[3], c[3] + (c[4] - c[3]) * 0.4, 0.10)
    ]), glassMat);
    group.add(cabHull);

    /* rear wing */
    if (style.wing) {
      var w = style.wing;
      var wing = new THREE.Mesh(new THREE.BoxGeometry(w.w * 2, w.h, w.d), bodyMat);
      wing.position.set(0, w.y, w.z);
      wing.rotation.x = -0.12;
      group.add(wing);
      if (w.stands) {
        for (var si = -1; si <= 1; si += 2) {
          var stand = new THREE.Mesh(new THREE.BoxGeometry(0.07, w.y - (style.sections[0].yt - 0.06), 0.14), darkMat);
          stand.position.set(si * w.w * 0.55, (w.y + (style.sections[0].yt - 0.06)) / 2 - 0.04, w.z + 0.04);
          group.add(stand);
        }
      }
    }

    /* splitter + diffuser */
    var front = style.sections[style.sections.length - 1];
    var splitter = new THREE.Mesh(new THREE.BoxGeometry(front.w * 1.85, 0.06, 0.30), darkMat);
    splitter.position.set(0, front.yb - 0.02, front.z * 0.92);
    group.add(splitter);
    var rear = style.sections[0];
    var diffuser = new THREE.Mesh(new THREE.BoxGeometry(rear.w * 1.8, 0.10, 0.28), darkMat);
    diffuser.position.set(0, rear.yb + 0.02, rear.z * 0.95);
    group.add(diffuser);

    /* side skirts */
    for (var sk = -1; sk <= 1; sk += 2) {
      var skirt = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 1.5), darkMat);
      skirt.position.set(sk * style.track * 0.98, 0.16, -0.05);
      group.add(skirt);
    }

    /* headlights / taillights */
    var headMat = new THREE.MeshBasicMaterial({ color: 0xfff4d0 });
    var tailMat = new THREE.MeshBasicMaterial({ color: 0xff1b1b });
    var brakeMats = [];
    for (var hs = -1; hs <= 1; hs += 2) {
      var hl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.06), headMat);
      hl.position.set(hs * front.w * 0.62, front.yb + (front.yt - front.yb) * 0.42, front.z * 0.99);
      group.add(hl);
      var tl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.05), tailMat);
      tl.position.set(hs * rear.w * 0.66, rear.yb + (rear.yt - rear.yb) * 0.5, rear.z * 0.99 - 0.02);
      group.add(tl);
      brakeMats.push(tailMat);
    }

    /* exhausts */
    var ex = [];
    if (style.exhausts) {
      for (var i = 0; i < style.exhausts.length; i++) {
        var e = style.exhausts[i];
        var pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.14, 8), rimMat);
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(e[0], e[1], e[2] - 0.04);
        group.add(pipe);
        var flame = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.55, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
        flame.rotation.x = Math.PI / 2;
        flame.position.set(e[0], e[1], e[2] - 0.36);
        flame.visible = false;
        group.add(flame);
        ex.push(flame);
      }
    }

    /* wheels */
    var wheels = [];
    var wheelGeo = new THREE.CylinderGeometry(style.wheelR, style.wheelR, style.wheelW, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    var rimGeo = new THREE.CylinderGeometry(style.wheelR * 0.62, style.wheelR * 0.62, style.wheelW * 1.06, 12);
    rimGeo.rotateZ(Math.PI / 2);
    var wpos = [
      [-style.track, style.frontZ], [style.track, style.frontZ],
      [-style.track, style.rearZ], [style.track, style.rearZ]
    ];
    for (var wi = 0; wi < 4; wi++) {
      var wheel = new THREE.Group();
      var tyre = new THREE.Mesh(wheelGeo, tyreMat);
      var rim = new THREE.Mesh(rimGeo, rimMat);
      wheel.add(tyre); wheel.add(rim);
      wheel.position.set(wpos[wi][0], style.wheelR, wpos[wi][1]);
      group.add(wheel);
      wheels.push(wheel);
    }

    group.userData.style = style;
    group.userData.wheels = wheels;
    group.userData.flames = ex;
    group.userData.materials = { body: bodyMat, accent: darkMat, glass: glassMat, rim: rimMat, tyre: tyreMat, tail: tailMat };
    group.scale.setScalar(style.scale);
    return group;
  }

  function recolor(mesh, colors) {
    var m = mesh.userData.materials;
    if (!m) return;
    if (colors.body != null) m.body.color.setHex(colors.body);
    if (colors.accent != null) m.accent.color.setHex(colors.accent);
    if (colors.rim != null) m.rim.color.setHex(colors.rim);
  }

  /* ------------------------------------------------------------------
     Catalogue — original cars (classes D..S)
     ------------------------------------------------------------------ */
  var CARS = [
    { id: 'vihr', name: 'Вихрь GT', cls: 'D', style: 'gt', price: 0, topSpeed: 205, accel: 6.4, handling: 0.92, nitroPower: 0.16, star: 0, accent: 0x14181f, desc: 'Учебная машина школы NITRO RUSH. Прощает ошибки.' },
    { id: 'kometa', name: 'Комета R', cls: 'D', style: 'rally', price: 18000, topSpeed: 218, accel: 5.9, handling: 1.00, nitroPower: 0.18, star: 2, accent: 0x1b2027, desc: 'Лёгкая и цепкая: хорошо держит дрифт.' },
    { id: 'strela', name: 'Стрела 340', cls: 'C', style: 'gt', price: 46000, topSpeed: 244, accel: 5.2, handling: 1.06, nitroPower: 0.20, star: 6, accent: 0x101820, desc: 'Классика тюнинга: ровная тяга и стабильность.' },
    { id: 'groza', name: 'Гроза 500', cls: 'C', style: 'muscle', price: 78000, topSpeed: 252, accel: 5.0, handling: 1.02, nitroPower: 0.21, star: 10, desc: 'Тяжёлый маскл. гроза прямых.', accent: 0x1d1a16 },
    { id: 'barracuda', name: 'Барракуда', cls: 'B', style: 'gt', price: 132000, topSpeed: 276, accel: 4.4, handling: 1.14, nitroPower: 0.23, star: 16, desc: 'Аэродинамика уровня трассы: любит длинные дуги.', accent: 0x0f151c },
    { id: 'shkval', name: 'Шквал', cls: 'B', style: 'rally', price: 168000, topSpeed: 268, accel: 4.1, handling: 1.20, nitroPower: 0.24, star: 20, desc: 'Раллийный характер: держит трамплины мягко.', accent: 0x18202a },
    { id: 'impuls', name: 'Импульс EV', cls: 'B', style: 'hyper', price: 215000, topSpeed: 288, accel: 3.4, handling: 1.18, nitroPower: 0.26, star: 26, desc: 'Электрический момент с нуля: разгон как удар.', accent: 0x0d1a22 },
    { id: 'tayfun', name: 'Тайфун X', cls: 'A', style: 'hyper', price: 340000, topSpeed: 318, accel: 3.0, handling: 1.26, nitroPower: 0.28, star: 34, desc: 'Гиперкар для города: цепляется за развязки.', accent: 0x121a12 },
    { id: 'gepard', name: 'Гепард S', cls: 'A', style: 'gt', price: 430000, topSpeed: 330, accel: 2.8, handling: 1.30, nitroPower: 0.29, star: 40, desc: 'Точный руль и агрессивный нитро-выхлоп.', accent: 0x1a1212 },
    { id: 'meteor', name: 'Метеор 44', cls: 'A', style: 'muscle', price: 520000, topSpeed: 342, accel: 2.6, handling: 1.24, nitroPower: 0.31, star: 48, desc: 'Монстр прямых. В поворотах требует рук.', accent: 0x201410 },
    { id: 'vulkan', name: 'Вулкан RS', cls: 'S', style: 'hyper', price: 780000, topSpeed: 372, accel: 2.3, handling: 1.36, nitroPower: 0.33, star: 58, desc: 'Топ-класс: скорость, которую трудно удержать.', accent: 0x1c0f14 },
    { id: 'feniks', name: 'Феникс GT', cls: 'S', style: 'gt', price: 1050000, topSpeed: 388, accel: 2.1, handling: 1.42, nitroPower: 0.35, star: 70, desc: 'Флагман. Ошибок не признаёт.', accent: 0x241a08 }
  ];

  var UPGRADES = [
    { id: 'engine', name: 'Двигатель', desc: 'Максимальная скорость', icon: '⚙', perLevel: 0.030 },
    { id: 'gearbox', name: 'Коробка', desc: 'Ускорение', icon: '⇄', perLevel: 0.035 },
    { id: 'tires', name: 'Шины', desc: 'Управляемость и дрифт', icon: '◎', perLevel: 0.040 },
    { id: 'nitro', name: 'Нитро', desc: 'Сила и запас нитро', icon: '⏵', perLevel: 0.045 }
  ];
  var MAX_LEVEL = 5;

  function upgradeCost(car, upId, level) {
    var base = Math.max(1200, car.price * 0.055);
    var up = 1.0 + (CARS.indexOf(car) * 0.05);
    return Math.round((base * up * Math.pow(1.55, level)) / 100) * 100;
  }

  /* --------------------------------------------------------------
     Drive model calibration.
     Longitudinal model:  dv/dt = a0 * (1 - KD*(v/vt)^2 - KR*(v/vt))
     KD/KR split the tractive force between aero drag and rolling
     resistance so that the terminal speed equals the car's top speed.
     We then solve a0 so the simulated 0-100 km/h time matches the
     catalogue figure - the numbers in the garage stay honest.
     -------------------------------------------------------------- */
  var KD = 0.82, KR = 0.18, V100 = 27.78;
  function accelIntegral(x100) {
    var n = 240, h = x100 / n, sum = 0;
    for (var i = 0; i <= n; i++) {
      var x = i * h;
      var g = 1 - KD * x * x - KR * x;
      if (g < 0.06) g = 0.06;
      var w = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2);
      sum += w / g;
    }
    return sum * h / 3;
  }
  function calibrate(car, e, g) {
    var vTop = (car.topSpeed * (1 + e)) / 3.6;
    var accel = car.accel / (1 + g);
    var x100 = Math.min(0.92, V100 / vTop);
    var a0 = vTop * accelIntegral(x100) / accel;
    return { a0: a0, accel: accel, vTop: vTop };
  }

  /* effective stats with upgrades applied */
  function statsFor(car, levels) {
    levels = levels || {};
    var e = (levels.engine || 0) * UPGRADES[0].perLevel;
    var g = (levels.gearbox || 0) * UPGRADES[1].perLevel;
    var t = (levels.tires || 0) * UPGRADES[2].perLevel;
    var n = (levels.nitro || 0) * UPGRADES[3].perLevel;
    var cal = calibrate(car, e, g);
    var mass = 1200 + car.price / 900;
    return {
      topSpeedMs: cal.vTop,
      a0: cal.a0,
      force: mass * cal.a0,
      dragK: mass * cal.a0 * KD / (cal.vTop * cal.vTop),
      rollK: mass * cal.a0 * KR / cal.vTop,
      accel: cal.accel,
      handling: car.handling * (1 + t),
      nitroPower: car.nitroPower * (1 + n * 0.8),
      nitroCapacity: 100 * (1 + n * 0.5),
      mass: mass
    };
  }

  /* rating bar 0..1 for UI */
  function ratingOf(v, min, max) { return U.clamp01((v - min) / (max - min)); }

  NR.STYLES = STYLES;
  NR.CARS = CARS;
  NR.UPGRADES = UPGRADES;
  NR.MAX_LEVEL = MAX_LEVEL;
  NR.CarFactory = {
    buildCarMesh: buildCarMesh,
    recolor: recolor,
    statsFor: statsFor,
    upgradeCost: upgradeCost,
    ratingOf: ratingOf,
    carById: function (id) { for (var i = 0; i < CARS.length; i++) if (CARS[i].id === id) return CARS[i]; return CARS[0]; },
    indexOf: function (id) { for (var i = 0; i < CARS.length; i++) if (CARS[i].id === id) return i; return 0; }
  };
})();

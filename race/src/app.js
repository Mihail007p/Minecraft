/* NITRO RUSH — application shell: screens, garage, career, input, main loop */
(function () {
  'use strict';
  var NR = (window.NR = window.NR || {});
  var U = NR.U;
  var HUD = NR.HUD;

  function $(id) { return document.getElementById(id); }
  function mk(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function show(id, on) {
    var e = $(id);
    if (!e) return;
    if (on === undefined) on = true;
    if (on) e.classList.add('on'); else e.classList.remove('on');
  }
  function only(screenId) {
    var ids = ['s-loading', 's-menu', 's-career', 's-quick', 's-garage', 's-race'];
    for (var i = 0; i < ids.length; i++) show(ids[i], ids[i] === screenId);
  }
  function chip(label, on, cb) {
    var b = mk('button', 'chip' + (on ? ' on' : ''), label);
    b.addEventListener('click', cb);
    return b;
  }

  var App = {
    state: 'boot',
    quality: 'medium',
    qualityAuto: true,
    pixelScale: 1,
    renderer: null,
    camera: null,
    scene: null,
    menuScene: null,
    menuCar: null,
    menuT: 0,
    view: null,
    raceConfig: null,
    lastRaceConfig: null,
    input: { throttle: 0, brake: 0, steer: 0, handbrake: 0, nitro: 0 },
    keys: {},
    touch: { steerL: false, steerR: false, drag: null, baseSteer: 0, steer: 0 },
    tilt: { gamma: 0, calib: null, active: false },
    settings: null,
    save: null,
    fps: { frames: 0, time: 0, value: 60, history: [] },
    raceStartWall: 0,
    paused: false
  };
  NR.App = App;

  /* ==================================================================
     renderer / quality
     ================================================================== */
  App.initRenderer = function () {
    var canvas = $('gl');
    var opts = { canvas: canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, depth: true };
    try {
      App.renderer = new THREE.WebGLRenderer(opts);
    } catch (e) {
      var t = $('load-text');
      if (t) t.textContent = 'Не удалось запустить WebGL: ' + e.message;
      return false;
    }
    /* classic (pre-r155) light units: predictable, bright arcade look */
    if ('useLegacyLights' in App.renderer) { try { App.renderer.useLegacyLights = true; } catch (e) { } }
    App.renderer.setClearColor(0x05060a, 1);
    App.detectQuality();
    App.applyPixelRatio();
    App.camera = new THREE.PerspectiveCamera(62, window.innerWidth / Math.max(1, window.innerHeight), 0.35, 1600);
    window.addEventListener('resize', App.onResize);
    if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
      try { window.screen.orientation.lock('landscape').catch(function () { }); } catch (e) { }
    }
    return true;
  };

  App.detectQuality = function () {
    var q = (App.settings && App.settings.quality) || 'auto';
    if (q !== 'auto') { App.quality = q; App.qualityAuto = false; return; }
    App.qualityAuto = true;
    var cores = navigator.hardwareConcurrency || 4;
    var mem = navigator.deviceMemory || 4;
    var gpu = App.gpuName();
    var score = 0;
    if (/adreno 7|adreno 6[6-9]|mali-g7[1-9]|mali-g6[8-9]|apple gpu|apple a1[2-9]/i.test(gpu)) score += 3;
    else if (/adreno 6|mali-g[5-7]|powervr|immortalis/i.test(gpu)) score += 1.4;
    else if (gpu) score += 0.6;
    else score += 1.2;
    if (cores >= 8) score += 1.2; else if (cores >= 6) score += 0.8; else if (cores >= 4) score += 0.4;
    if (mem >= 8) score += 1; else if (mem >= 6) score += 0.7; else if (mem >= 4) score += 0.4;
    App.quality = score >= 4.6 ? 'high' : (score >= 2.1 ? 'medium' : 'low');
  };

  App.gpuName = function () {
    if (App._gpu !== undefined) return App._gpu;
    App._gpu = '';
    try {
      var gl = App.renderer.getContext();
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      App._gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    } catch (e) { App._gpu = ''; }
    return App._gpu;
  };

  /* measure the display refresh rate so 90/120 Hz phones keep their cadence */
  App.measureRefresh = function () {
    var samples = [];
    var last = performance.now();
    var frames = 0;
    function tick(now) {
      samples.push(now - last);
      last = now;
      frames++;
      if (frames < 40) { requestAnimationFrame(tick); return; }
      samples.sort(function (a, b) { return a - b; });
      var median = samples[Math.floor(samples.length / 2)] || 16.7;
      App.refreshHz = Math.max(50, Math.min(144, 1000 / median));
    }
    requestAnimationFrame(tick);
  };

  App.applyPixelRatio = function () {
    if (!App.renderer) return;
    var dpr = window.devicePixelRatio || 1;
    var base = App.quality === 'low' ? 0.95 : App.quality === 'medium' ? 1.25 : 1.6;
    var ratio = Math.min(dpr, base) * App.pixelScale;
    ratio = U.clamp(ratio, 0.6, 2);
    App.renderer.setPixelRatio(ratio);
    App.renderer.setSize(window.innerWidth, window.innerHeight, false);
  };

  App.onResize = function () {
    if (!App.renderer || !App.camera) return;
    App.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    App.camera.updateProjectionMatrix();
    App.applyPixelRatio();
  };

  /* ==================================================================
     menu showroom
     ================================================================== */
  App.buildMenuScene = function () {
    var scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0a12, 12, 46);
    scene.add(new THREE.HemisphereLight(0x8090c0, 0x101018, 0.9));
    App.renderErrors = 0;
    var l1 = new THREE.DirectionalLight(0xff5fae, 1.5); l1.position.set(6, 7, 5); scene.add(l1);
    var l2 = new THREE.DirectionalLight(0x5fd8ff, 1.2); l2.position.set(-7, 5, -4); scene.add(l2);
    var l3 = new THREE.PointLight(0xffffff, 0.9, 40); l3.position.set(0, 4, 6); scene.add(l3);

    var floorGeo = new THREE.CircleGeometry(22, 40);
    var floor = new THREE.Mesh(floorGeo, new THREE.MeshPhongMaterial({ color: 0x14151d, shininess: 80, specular: 0x334455 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    var ringGeo = new THREE.RingGeometry(6.6, 7.1, 48);
    var ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff2f6d, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
    scene.add(ring);
    var ring2 = new THREE.Mesh(new THREE.RingGeometry(11.4, 11.6, 8), new THREE.MeshBasicMaterial({ color: 0x2fd0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.45 }));
    ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.015;
    scene.add(ring2);

    /* neon pylons */
    for (var i = 0; i < 12; i++) {
      var a = i / 12 * Math.PI * 2;
      var h = 5 + (i % 3) * 1.6;
      var p = new THREE.Mesh(new THREE.BoxGeometry(0.35, h, 0.35),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff2f6d : 0x2fd0ff, transparent: true, opacity: 0.75 }));
      p.position.set(Math.cos(a) * 13, h / 2, Math.sin(a) * 13);
      scene.add(p);
    }
    var sky = NR.SceneKit.buildSky({ sky: [0x05060c, 0x1a1030], sun: 0xff2f6d, sunDir: [0.3, 0.4, -0.6], night: true }, 300);
    scene.add(sky);
    App.menuScene = scene;
    App.setMenuCar(NR.Save.currentCar(), NR.Save.carState(NR.Save.data.selectedCar));
    return scene;
  };

  App.setMenuCar = function (carDef, st) {
    if (App.menuCar) App.menuScene.remove(App.menuCar);
    var vis = new THREE.Group();
    var mesh = NR.CarFactory.buildCarMesh(carDef.style, { body: st.color, accent: st.accent, rim: st.rim });
    mesh.scale.setScalar(1.35);
    vis.add(mesh);
    App.menuCar = vis;
    App.menuCar.spin = 0;
    App.menuScene.add(vis);
  };

  App.updateMenuScene = function (dt) {
    if (!App.menuScene) return;
    App.menuT += dt;
    var dpr = 1;
    if (App.menuCar) {
      App.menuCar.spin += dt * 0.35;
      App.menuCar.rotation.y = App.menuCar.spin;
      App.menuCar.position.y = 0.02 + Math.sin(App.menuT * 1.4) * 0.06;
      var wheels = App.menuCar.children[0].userData.wheels;
      for (var i = 0; wheels && i < wheels.length; i++) wheels[i].rotation.x += dt * 0.6;
    }
    var cam = App.camera;
    var r = 11.5;
    cam.position.set(Math.sin(App.menuT * 0.16) * r, 3.4 + Math.sin(App.menuT * 0.4) * 0.35, Math.cos(App.menuT * 0.16) * r);
    cam.lookAt(0, 1.0, 0);
    cam.fov = 46; cam.updateProjectionMatrix();
    void dpr;
  };

  /* ==================================================================
     save / settings
     ================================================================== */
  App.storageOk = (function () {
    try {
      window.localStorage.setItem('nr.probe', '1');
      window.localStorage.removeItem('nr.probe');
      return true;
    } catch (e) { return false; }
  })();

  App.loadSave = function () {
    App.save = NR.Save.load();
    if (!App.storageOk) App.save._noStorage = true;
    App.settings = App.save.settings;
    if (App.settings.autoGas == null) App.settings.autoGas = true;
    /* в старых сохранениях лежало steerMode:'auto' — такого режима нет, из-за
       этого зоны руля были скрыты; любой неизвестный режим — это 'zones' */
    if (['zones', 'tilt', 'drag'].indexOf(App.settings.steerMode) < 0) App.settings.steerMode = 'zones';
    if (!App.settings.padSize) App.settings.padSize = 'normal';
    if (App.settings.tiltSens == null) App.settings.tiltSens = 26;
    if (App.settings.vibrate == null) App.settings.vibrate = true;
    if (App.settings.autoFull == null) App.settings.autoFull = true;
  };

  App.persist = function () { NR.Save.save(); };

  /* ==================================================================
     screens: main menu
     ================================================================== */
  App.openMenu = function () {
    App.state = 'menu';
    only('s-menu');
    App.input = { throttle: 0, brake: 0, steer: 0, handbrake: 0, nitro: 0 };
    App.refreshMenu();
  };

  App.refreshMenu = function () {
    var car = NR.Save.currentCar();
    var st = NR.Save.carState(App.save.selectedCar);
    var stats = NR.CarFactory.statsFor(car, st.upgrades);
    $('m-money').textContent = U.formatMoney(App.save.money);
    $('m-stars').textContent = String(NR.totalStars(App.save));
    $('m-carname').textContent = car.name;
    $('m-car-name').textContent = car.name;
    $('m-car-class').textContent = 'класс ' + car.cls;
    $('m-car-desc').textContent = car.desc;
    $('m-car-stats').innerHTML = '';
    var rows = [
      ['Скорость', stats.topSpeedMs * 3.6, 150, 400, 'км/ч'],
      ['Разгон 0–100', car.accel, 2.0, 7.0, 'с', true],
      ['Управляемость', stats.handling * 100, 80, 150, '%'],
      ['Нитро', stats.nitroPower * 100, 12, 40, '%']
    ];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var wrap = mk('div', '', '');
      wrap.appendChild(mk('div', 'tiny dim', r[0] + ' — ' + (r[4] === 'с' ? r[1].toFixed(1) : Math.round(r[1])) + ' ' + r[4]));
      var bar = mk('div', 'bar');
      var fill = mk('i');
      var t = r[5] ? 1 - U.clamp01((r[1] - r[2]) / (r[3] - r[2])) : U.clamp01((r[1] - r[2]) / (r[3] - r[2]));
      fill.style.width = (t * 100).toFixed(0) + '%';
      bar.appendChild(fill);
      wrap.appendChild(bar);
      $('m-car-stats').appendChild(wrap);
    }
    $('m-car-hint').textContent = 'Всего машин: ' + NR.CARS.length + ' · открыто: ' +
      Object.keys(App.save.cars).filter(function (k) { return App.save.cars[k].owned; }).length;
    var tip = $('m-tip');
    if (tip) {
      tip.textContent = App.storageOk
        ? 'Совет: дрифт заряжает нитро. Нитро на прямых — самый быстрый круг.'
        : 'Внимание: браузер не даёт сохранять прогресс для локального файла. Установите APK или откройте игру с сервера — тогда прогресс сохранится.';
    }
    if (App.menuScene) App.setMenuCar(car, st);
  };

  /* ==================================================================
     career
     ================================================================== */
  App.openCareer = function () {
    App.state = 'career';
    only('s-career');
    App.buildCareer();
  };

  App.buildCareer = function () {
    var list = $('career-list');
    list.innerHTML = '';
    $('c-stars').textContent = String(NR.totalStars(App.save));
    for (var si = 0; si < NR.SERIES.length; si++) {
      var series = NR.SERIES[si];
      var unlocked = NR.isSeriesUnlocked(App.save, si);
      var prog = NR.seriesProgress(App.save, series.id);
      var box = mk('div', 'series');
      var head = mk('div', 'row');
      head.appendChild(mk('h3', '', series.name + (unlocked ? '' : ' 🔒')));
      head.appendChild(mk('div', 'grow'));
      head.appendChild(mk('div', 'small dim', 'звёзды: ' + prog.stars + '/' + prog.max));
      box.appendChild(head);
      if (!unlocked) {
        var need = Math.ceil(NR.SERIES[si - 1].events.length * 1.4);
        box.appendChild(mk('div', 'small dim', 'Откройте: нужно ' + need + ' звёзд в «' + NR.SERIES[si - 1].name + '»'));
      }
      for (var ei = 0; ei < series.events.length; ei++) {
        (function (ev, idx) {
          var unlockedEv = unlocked && NR.isEventUnlocked(App.save, series, idx);
          var rec = App.save.career[ev.id];
          var row = mk('div', 'evt' + (unlockedEv ? '' : ' locked') + (rec && rec.stars ? ' on' : ''));
          var left = mk('div');
          left.appendChild(mk('div', 't', ev.name + (unlockedEv ? '' : ' 🔒')));
          var modeName = { race: 'гонка', duel: 'дуэль', timeattack: 'на время', pursuit: 'погоня' }[ev.mode] || 'гонка';
          var trk = NR.trackById(ev.track);
          left.appendChild(mk('div', 'm', modeName + ' · ' + trk.name + ' · ' + ev.laps + ' кр · ' + ev.rivals + ' соп.'));
          row.appendChild(left);
          row.appendChild(mk('div', 'grow'));
          row.appendChild(mk('div', 'small stars', rec ? '★'.repeat(rec.stars) + '☆'.repeat(3 - rec.stars) : '☆☆☆'));
          var btn = mk('button', 'btn primary small', rec && rec.stars ? 'Ещё раз' : 'Старт');
          btn.style.minHeight = '38px';
          if (!unlockedEv) btn.setAttribute('disabled', 'disabled');
          btn.addEventListener('click', function () { App.playFrom(function () { App.startCareerEvent(ev); }); });
          row.appendChild(btn);
          box.appendChild(row);
        })(series.events[ei], ei);
      }
      list.appendChild(box);
    }
  };

  App.startCareerEvent = function (ev) {
    var car = NR.Save.currentCar();
    var cfg = {
      mode: ev.mode, trackId: ev.track, laps: ev.laps, difficulty: ev.difficulty,
      playerCar: car, upgrades: NR.Save.carState(car.id).upgrades,
      color: NR.Save.carState(car.id).color,
      rivals: ev.rivals, cops: ev.cops || 0, targetPlace: ev.targetPlace,
      targetTime: ev.targetTime, eventId: ev.id, eventName: ev.name,
      lapsToSurvive: ev.lapsToSurvive, career: true, seed: ev.name.length * 977 + 13
    };
    App.startRace(cfg);
  };

  /* ==================================================================
     quick race
     ================================================================== */
  App.quick = { trackId: NR.TRACKS[0].id, laps: 2, rivals: 4, difficulty: 0.55 };

  App.openQuick = function () {
    App.state = 'quick';
    only('s-quick');
    App.buildQuick();
  };

  App.buildQuick = function () {
    var trBox = $('quick-tracks');
    trBox.innerHTML = '';
    NR.TRACKS.forEach(function (t) {
      trBox.appendChild(chip(t.name, App.quick.trackId === t.id, function () {
        App.quick.trackId = t.id; App.buildQuick();
      }));
    });
    function group(boxId, values, current, setter, fmt) {
      var box = $(boxId);
      box.innerHTML = '';
      values.forEach(function (v) {
        box.appendChild(chip(fmt ? fmt(v) : String(v), current === v, function () { setter(v); App.buildQuick(); }));
      });
    }
    group('quick-laps', [1, 2, 3, 4, 5], App.quick.laps, function (v) { App.quick.laps = v; });
    group('quick-rivals', [0, 1, 3, 5, 7], App.quick.rivals, function (v) { App.quick.rivals = v; });
    group('quick-diff', [0.3, 0.5, 0.7, 0.9], App.quick.difficulty, function (v) { App.quick.difficulty = v; },
      function (v) { return v <= 0.3 ? 'легко' : v <= 0.5 ? 'средне' : v <= 0.7 ? 'сложно' : 'хардкор'; });
    var def = NR.trackById(App.quick.trackId);
    $('quick-info').textContent = def.name + ' · ' + def.desc;
  };

  App.startQuick = function () {
    var car = NR.Save.currentCar();
    App.startRace({
      mode: 'race', trackId: App.quick.trackId, laps: App.quick.laps, rivals: App.quick.rivals,
      difficulty: App.quick.difficulty, playerCar: car,
      upgrades: NR.Save.carState(car.id).upgrades, color: NR.Save.carState(car.id).color,
      targetPlace: 3, quick: true, seed: (Date.now() % 100000)
    });
  };

  /* ==================================================================
     garage
  */
  App.garage = { carId: NR.Save.data.selectedCar, tab: 'upgrades' };
  var BODY_COLORS = [0xd11f2f, 0x1b4fd8, 0x12c46a, 0xffc020, 0xff6a00, 0x8a2be2, 0xf2f4f7, 0x1a1c22, 0x00c8d7, 0xff2f8e];
  var RIM_COLORS = [0xd7dde6, 0x2a2d34, 0xffd400, 0xff2f6d, 0x00e0ff];
  var ACCENT_COLORS = [[0x14181f, 'графит'], [0x1a1c22, 'чёрный'], [0xf2f4f7, 'белый'], [0xff2f6d, 'розовый'], [0xd4af37, 'золото']];

  App.openGarage = function () {
    App.state = 'garage';
    only('s-garage');
    App.buildGarage();
  };

  App.buildGarage = function () {
    var st = App.save;
    var list = $('garage-list');
    list.innerHTML = '';
    $('garage-money').textContent = U.formatMoney(st.money);
    NR.CARS.forEach(function (car) {
      var owned = NR.Save.owned(car.id);
      var sel = App.save.selectedCar === car.id;
      var row = mk('div', 'car' + (owned ? ' owned' : '') + (App.garage.carId === car.id ? ' on' : ''));
      var left = mk('div');
      left.appendChild(mk('div', 'n', car.name));
      left.appendChild(mk('div', 'tiny dim', 'класс ' + car.cls + ' · ' + car.topSpeed + ' км/ч · ' + car.accel.toFixed(1) + 'с'));
      row.appendChild(left);
      row.appendChild(mk('div', 'grow'));
      row.appendChild(mk('div', 'p', owned ? (sel ? 'выбрана' : 'есть') : U.formatMoney(car.price)));
      row.addEventListener('click', function () { App.garage.carId = car.id; App.buildGarage(); });
      list.appendChild(row);
    });

    var car = NR.CarFactory.carById(App.garage.carId);
    var cst = NR.Save.carState(car.id);
    var owned = NR.Save.owned(car.id);
    var stats = NR.CarFactory.statsFor(car, cst.upgrades);
    $('garage-name').textContent = car.name;
    $('garage-class').textContent = 'класс ' + car.cls;
    $('garage-desc').textContent = car.desc;

    var sbox = $('garage-stats');
    sbox.innerHTML = '';
    [['Скорость', Math.round(stats.topSpeedMs * 3.6) + ' км/ч', U.clamp01((stats.topSpeedMs * 3.6 - 150) / 250)],
    ['0–100', stats.accel.toFixed(2) + ' с', 1 - U.clamp01((stats.accel - 2) / 5)],
    ['Руль', Math.round(stats.handling * 100) + '%', U.clamp01((stats.handling - 0.8) / 0.7)],
    ['Нитро', Math.round(stats.nitroPower * 100) + '%', U.clamp01((stats.nitroPower - 0.12) / 0.28)]]
      .forEach(function (row) {
        var d = mk('div');
        d.appendChild(mk('div', 'tiny dim', row[0] + ' — ' + row[1]));
        var b = mk('div', 'bar'); var f = mk('i');
        f.style.width = (row[2] * 100).toFixed(0) + '%';
        b.appendChild(f); d.appendChild(b);
        sbox.appendChild(d);
      });

    var ubox = $('garage-upgrades');
    ubox.innerHTML = '';
    $('garage-upg-hint').textContent = owned ? 'нажмите, чтобы улучшить' : 'сначала купите машину';
    NR.UPGRADES.forEach(function (up) {
      var lvl = cst.upgrades[up.id] || 0;
      var row = mk('div', 'upg');
      row.appendChild(mk('div', 'small', up.icon + ' ' + up.name));
      var dots = mk('div', 'dots');
      for (var i = 0; i < NR.MAX_LEVEL; i++) dots.appendChild(mk('i', i < lvl ? 'on' : ''));
      row.appendChild(dots);
      row.appendChild(mk('div', 'grow'));
      var maxed = lvl >= NR.MAX_LEVEL;
      var cost = maxed ? 0 : NR.CarFactory.upgradeCost(car, up.id, lvl);
      var btn = mk('button', 'btn ghost small', maxed ? 'макс' : U.formatMoney(cost));
      btn.style.minHeight = '34px';
      if (!owned || maxed) btn.setAttribute('disabled', 'disabled');
      btn.addEventListener('click', function () { App.buyUpgrade(car, up.id); });
      row.appendChild(btn);
      ubox.appendChild(row);
    });

    var cbox = $('garage-colors');
    cbox.innerHTML = '';
    if (owned) {
      BODY_COLORS.forEach(function (c) {
        var s = mk('div', 'sw' + (cst.color === c ? ' on' : ''));
        s.style.background = '#' + c.toString(16).padStart(6, '0');
        s.addEventListener('click', function () { cst.color = c; App.persist(); App.buildGarage(); App.refreshMenu(); if (App.menuScene) App.setMenuCar(car, cst); });
        cbox.appendChild(s);
      });
      ACCENT_COLORS.forEach(function (pair) {
        var s = mk('div', 'sw' + (cst.accent === pair[0] ? ' on' : ''));
        s.style.background = '#' + pair[0].toString(16).padStart(6, '0');
        s.style.borderRadius = '50%';
        s.addEventListener('click', function () { cst.accent = pair[0]; App.persist(); App.buildGarage(); if (App.menuScene) App.setMenuCar(car, cst); });
        cbox.appendChild(s);
      });
      $('garage-accent-name').textContent = (ACCENT_COLORS.filter(function (p) { return p[0] === cst.accent; })[0] || [0, '—'])[1];
    }

    var buyBtn = $('btn-garage-buy');
    var selBtn = $('btn-garage-select');
    if (owned) {
      buyBtn.style.display = 'none';
      selBtn.style.display = '';
      selBtn.textContent = App.save.selectedCar === car.id ? 'Выбрана' : 'Выбрать';
      selBtn.setAttribute('disabled', App.save.selectedCar === car.id ? 'disabled' : 'null');
      if (App.save.selectedCar === car.id) selBtn.setAttribute('disabled', 'disabled'); else selBtn.removeAttribute('disabled');
    } else {
      buyBtn.style.display = '';
      selBtn.style.display = 'none';
      buyBtn.textContent = 'Купить за ' + U.formatMoney(car.price);
      if (App.save.money < car.price) buyBtn.setAttribute('disabled', 'disabled'); else buyBtn.removeAttribute('disabled');
    }
    $('btn-garage-max').style.display = owned ? '' : 'none';
  };

  App.buyUpgrade = function (car, upId) {
    var cst = NR.Save.carState(car.id);
    var lvl = cst.upgrades[upId] || 0;
    if (lvl >= NR.MAX_LEVEL) return;
    var cost = NR.CarFactory.upgradeCost(car, upId, lvl);
    if (App.save.money < cost) { NR.Audio.blip(220, 0.18, 'square', 0.12); return; }
    App.save.money -= cost;
    cst.upgrades[upId] = lvl + 1;
    App.persist();
    NR.Audio.blip(880, 0.12, 'triangle', 0.14);
    App.buildGarage();
    App.refreshMenu();
  };

  App.maxTune = function () {
    var car = NR.CarFactory.carById(App.garage.carId);
    var cst = NR.Save.carState(car.id);
    if (!NR.Save.owned(car.id)) return;
    var guard = 0;
    while (guard++ < 60) {
      var cheapest = null;
      NR.UPGRADES.forEach(function (up) {
        var lvl = cst.upgrades[up.id] || 0;
        if (lvl >= NR.MAX_LEVEL) return;
        var cost = NR.CarFactory.upgradeCost(car, up.id, lvl);
        if (cost <= App.save.money && (!cheapest || cost < cheapest.cost)) cheapest = { id: up.id, cost: cost };
      });
      if (!cheapest) break;
      App.save.money -= cheapest.cost;
      cst.upgrades[cheapest.id] = (cst.upgrades[cheapest.id] || 0) + 1;
    }
    App.persist();
    App.buildGarage();
    App.refreshMenu();
  };

  App.buyCar = function () {
    var car = NR.CarFactory.carById(App.garage.carId);
    if (NR.Save.owned(car.id)) return;
    if (App.save.money < car.price) return;
    App.save.money -= car.price;
    var cst = NR.Save.carState(car.id);
    cst.owned = true;
    cst.color = BODY_COLORS[(NR.CarFactory.indexOf(car.id) + 3) % BODY_COLORS.length];
    App.save.selectedCar = car.id;
    App.persist();
    NR.Audio.chime('win');
    App.buildGarage();
    App.refreshMenu();
  };

  App.selectCar = function () {
    App.save.selectedCar = App.garage.carId;
    App.persist();
    App.buildGarage();
    App.refreshMenu();
  };

  /* ==================================================================
     settings
     ================================================================== */
  App.openSettings = function (from) {
    App.settingsFrom = from || App.state;
    App.buildSettings();
    show('s-settings', true);
  };

  App.buildSettings = function () {
    var s = App.settings;
    var assistBox = $('set-assist');
    assistBox.innerHTML = '';
    [[0, 'выкл'], [0.5, 'средне'], [0.9, 'полная']].forEach(function (pair) {
      assistBox.appendChild(chip(pair[1], Math.abs((s.assist || 0) - pair[0]) < 0.01, function () {
        s.assist = pair[0]; App.persist(); App.buildSettings();
      }));
    });
    var steerBox = $('set-steer');
    steerBox.innerHTML = '';
    [['zones', 'кнопки ‹ ›'], ['tilt', 'наклон телефона'], ['drag', 'свайп по экрану']].forEach(function (pair) {
      steerBox.appendChild(chip(pair[1], s.steerMode === pair[0], function () {
        s.steerMode = pair[0]; App.persist(); App.buildSettings(); App.applySteerMode();
        if (pair[0] === 'tilt') App.requestTilt();
      }));
    });
    var qBox = $('set-quality');
    qBox.innerHTML = '';
    [['auto', 'авто'], ['low', 'низкое'], ['medium', 'среднее'], ['high', 'высокое']].forEach(function (pair) {
      qBox.appendChild(chip(pair[1], (s.quality || 'auto') === pair[0], function () {
        s.quality = pair[0]; App.persist(); App.detectQuality(); App.applyPixelRatio(); App.buildSettings();
      }));
    });
    var autoBox = $('set-auto');
    autoBox.innerHTML = '';
    [[true, 'вкл'], [false, 'выкл']].forEach(function (pair) {
      autoBox.appendChild(chip(pair[1], !!s.autoGas === pair[0], function () {
        s.autoGas = pair[0]; App.persist(); App.buildSettings(); App.applySteerMode();
      }));
    });
    var sfxBox = $('set-sfx');
    sfxBox.innerHTML = '';
    [[true, 'звуки вкл'], [false, 'звуки выкл']].forEach(function (pair) {
      sfxBox.appendChild(chip(pair[1], !!s.sfx === pair[0], function () {
        s.sfx = pair[0]; App.persist(); NR.Audio.setEnabled(s.sfx, s.music); App.buildSettings();
      }));
    });
    var mBox = $('set-music');
    mBox.innerHTML = '';
    [[true, 'музыка вкл'], [false, 'музыка выкл']].forEach(function (pair) {
      mBox.appendChild(chip(pair[1], !!s.music === pair[0], function () {
        s.music = pair[0]; App.persist(); NR.Audio.setEnabled(s.sfx, s.music); App.buildSettings();
      }));
    });
    var invBox = $('set-invert');
    invBox.innerHTML = '';
    [[false, 'наклон: обычный'], [true, 'наклон: инвертировать']].forEach(function (pair) {
      invBox.appendChild(chip(pair[1], !!s.invertTilt === pair[0], function () {
        s.invertTilt = pair[0]; App.persist(); App.buildSettings();
      }));
    });
    var padBox = $('set-pads');
    if (padBox) {
      padBox.innerHTML = '';
      [['normal', 'обычные'], ['big', 'крупные']].forEach(function (pair) {
        padBox.appendChild(chip(pair[1], (s.padSize || 'normal') === pair[0], function () {
          s.padSize = pair[0]; App.persist(); App.applySteerMode(); App.buildSettings();
        }));
      });
    }
    var tiltBox = $('set-tilt');
    if (tiltBox) {
      tiltBox.innerHTML = '';
      [[34, 'низкая'], [26, 'средняя'], [18, 'высокая']].forEach(function (pair) {
        tiltBox.appendChild(chip(pair[1], (s.tiltSens || 26) === pair[0], function () {
          s.tiltSens = pair[0]; App.persist(); App.buildSettings();
        }));
      });
    }
    var tiltCalBox = $('set-tiltcal');
    if (tiltCalBox) {
      tiltCalBox.innerHTML = '';
      var label = App.tilt.ready
        ? 'откалибровать наклон (сейчас ' + Math.round(App.tilt.calib || 0) + '°)'
        : 'разрешить наклон телефона';
      tiltCalBox.appendChild(chip(label, false, function () {
        if (App.tilt.ready) App.tilt.calib = App.tilt.gamma;
        else App.requestTilt();
        App.buildSettings();
      }));
    }
    var vibBox = $('set-vibr');
    if (vibBox) {
      vibBox.innerHTML = '';
      [[true, 'вибрация вкл'], [false, 'вибрация выкл']].forEach(function (pair) {
        vibBox.appendChild(chip(pair[1], (s.vibrate !== false) === pair[0], function () {
          s.vibrate = pair[0]; App.persist();
          if (pair[0]) App.buzz(20);
          App.buildSettings();
        }));
      });
    }
    var fullBox = $('set-full');
    if (fullBox) {
      fullBox.innerHTML = '';
      [[true, 'полный экран на старте'], [false, 'не включать']].forEach(function (pair) {
        fullBox.appendChild(chip(pair[1], (s.autoFull !== false) === pair[0], function () {
          s.autoFull = pair[0]; App.persist(); App.buildSettings();
        }));
      });
      fullBox.appendChild(chip(App.Full.active() ? 'выйти из полного экрана' : 'полный экран сейчас', false, function () {
        App.Full.toggle(); App.buildSettings();
      }));
    }
    $('set-fps').textContent = 'FPS: ' + App.fps.value.toFixed(0) + ' · качество: ' + App.quality + (App.qualityAuto ? ' (авто)' : '');
    var box = $('stats-box');
    var st = App.save.stats;
    box.innerHTML = '';
    box.appendChild(mk('div', 'small dim', 'Статистика'));
    [['Заездов', st.races || 0], ['Побед', st.wins || 0], ['Дистанция', Math.round((st.distance || 0) / 1000) + ' км'],
    ['Дрифт-очков', Math.round(st.driftTotal || 0)], ['Звёзд', NR.totalStars(App.save)]].forEach(function (row) {
      var d = mk('div', 'kv');
      d.appendChild(mk('span', 'small', row[0]));
      d.appendChild(mk('span', 'small', String(row[1])));
      box.appendChild(d);
    });
  };

  App.requestTilt = function () {
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(function (r) {
        if (r === 'granted') window.addEventListener('deviceorientation', App.onTilt);
      }).catch(function () { });
    } else {
      window.addEventListener('deviceorientation', App.onTilt);
    }
  };

  App.onTilt = function (e) {
    if (e.gamma == null) return;
    App.tilt.gamma = e.gamma;
    App.tilt.ready = true;
    if (App.tilt.calib == null) App.tilt.calib = e.gamma;
  };

  /* ==================================================================
     race lifecycle
     ================================================================== */
  App.startRace = function (cfg) {
    App.raceConfig = cfg;
    App.lastRaceConfig = JSON.parse(JSON.stringify({
      mode: cfg.mode, trackId: cfg.trackId, laps: cfg.laps, rivals: cfg.rivals, difficulty: cfg.difficulty,
      cops: cfg.cops, targetPlace: cfg.targetPlace, targetTime: cfg.targetTime, seed: cfg.seed,
      eventId: cfg.eventId, eventName: cfg.eventName, lapsToSurvive: cfg.lapsToSurvive, career: cfg.career, quick: cfg.quick
    }));
    App.state = 'loading';
    only('s-loading');
    show('s-results', false);
    show('s-pause', false);
    var bar = $('load-bar').firstElementChild;
    var txt = $('load-text');
    bar.style.width = '4%';
    txt.textContent = 'Подготовка трассы…';

    /* build rivals for the event */
    var trackDef = NR.trackById(cfg.trackId);
    var track = NR.buildTrack(trackDef);
    var rivalCount = cfg.mode === 'pursuit' ? (cfg.cops || 3) : (cfg.rivals || 0);
    var rivals = NR.makeRivals(track, rivalCount, {
      difficulty: cfg.difficulty, seed: (cfg.seed || 4242) + 3, pursuit: cfg.mode === 'pursuit'
    });
    var full = {
      trackId: cfg.trackId, laps: cfg.laps || trackDef.laps, difficulty: cfg.difficulty,
      playerCar: cfg.playerCar, upgrades: cfg.upgrades, color: cfg.color,
      mode: cfg.mode, assist: App.settings.assist,
      rivals: rivals.map(function (r) {
        return {
          name: r.name, skill: r.skill, aggression: r.aggression, lineBias: r.lineBias,
          mistakeChance: r.mistakeChance, seed: r.seed, pursuit: r.pursuit
        };
      }),
      seed: cfg.seed || 777
    };
    var self = this;
    NR.Audio.resume();
    var view = new NR.RaceView(App, full);
    App.view = view;
    setTimeout(function () {
      view.load(function (p, label) {
        bar.style.width = (4 + p * 92).toFixed(0) + '%';
        if (label) txt.textContent = label + '…';
      }, function () {
        bar.style.width = '100%';
        txt.textContent = 'Поехали!';
        App.scene = view.scene;
        App.renderErrors = 0;
        App.race = view.race;
        App.raceStartWall = performance.now();
        only('s-race');
        App.state = 'race';
        App.paused = false;
        App.applySteerMode();
        App.tilt.calib = App.tilt.ready ? App.tilt.gamma : null;
        App.wakeOn();
        App.clearInput();
        HUD.reset();
        HUD.toast('Погнали!', 'green', 1200);
        NR.Audio.startEngine({ freq: 46, range: 130 });
        NR.Audio.startSkid();
        if (App.save.stats) App.save.stats.races = (App.save.stats.races || 0) + 1;
        self.persist();
      });
    }, 30);
  };

  App.restartRace = function () {
    if (!App.lastRaceConfig) { App.openMenu(); return; }
    var cfg = App.lastRaceConfig;
    cfg.playerCar = NR.Save.currentCar();
    cfg.upgrades = NR.Save.carState(cfg.playerCar.id).upgrades;
    cfg.color = NR.Save.carState(cfg.playerCar.id).color;
    cfg.seed = (cfg.seed || 7) + 1;
    show('s-pause', false);
    show('s-results', false);
    App.startRace(cfg);
  };

  App.quitToMenu = function () {
    App.wakeOff();
    App.clearInput();
    show('s-pause', false);
    show('s-results', false);
    if (App.race) { App.race = null; App.view = null; App.scene = null; }
    NR.Audio.stopEngine();
    App.openMenu();
  };

  App.pauseRace = function () {
    if (App.state !== 'race') return;
    App.clearInput();
    App.paused = true;
    App.state = 'paused';
    var r = App.race;
    var box = $('pause-stats');
    if (box && r) {
      box.innerHTML = '';
      [['Позиция', r.player.position + ' из ' + r.cars.length],
      ['Круг', Math.min(r.laps, r.player.lap + 1) + ' / ' + r.laps],
      ['Время', U.formatTime(r.time)],
      ['Лучший круг', r.bestLap ? U.formatTime(r.bestLap) : '—'],
      ['Дрифт-очки', String(Math.round(r.player.driftScore))]].forEach(function (row) {
        var d = mk('div', 'kv');
        d.appendChild(mk('span', '', row[0]));
        d.appendChild(mk('span', '', row[1]));
        box.appendChild(d);
      });
    }
    show('s-pause', true);
  };

  App.resumeRace = function () {
    show('s-pause', false);
    show('s-settings', false);
    App.paused = false;
    App.state = 'race';
  };

  App.finishRace = function () {
    var view = App.view;
    if (!view || !view.race) return;
    var race = view.race;
    App.state = 'results';
    NR.Audio.stopEngine();
    var results = race.buildResults();
    var cfg = App.raceConfig || {};
    var reward = NR.computeReward(race, results, { targetPlace: cfg.targetPlace, targetTime: cfg.targetTime });
    /* mission modes have their own success rules */
    var success = true, title = 'финиш';
    if (race.state === 'busted') { success = false; title = 'арестован полицией'; reward.stars = 0; }
    else if (cfg.mode === 'timeattack' && cfg.targetTime) {
      success = reward.time != null && reward.time <= cfg.targetTime;
      title = success ? 'рекорд трассы!' : 'время не выбито';
      reward.stars = success ? 3 : 0;
    } else if (cfg.mode === 'pursuit') {
      success = true;
      reward.stars = race.player.damage < 35 ? 3 : race.player.damage < 70 ? 2 : 1;
      title = 'погоня пройдена';
    } else if (cfg.mode === 'duel') {
      success = reward.place === 1;
      title = success ? 'дуэль выиграна' : 'дуэль проиграна';
      reward.stars = success ? 3 : 0;
    } else {
      success = reward.place <= (cfg.targetPlace || 3);
      title = success ? 'цель достигнута' : 'цель не достигнута';
    }
    if (cfg.career && cfg.eventId && success) {
      var rec = App.save.career[cfg.eventId] || { stars: 0, best: null };
      rec.stars = Math.max(rec.stars || 0, reward.stars);
      if (reward.time != null && (rec.best == null || reward.time < rec.best)) rec.best = reward.time;
      App.save.career[cfg.eventId] = rec;
    }
    App.save.money += reward.total;
    var st = App.save.stats || (App.save.stats = {});
    if (reward.place === 1) st.wins = (st.wins || 0) + 1;
    st.distance = (st.distance || 0) + race.player.lap * race.track.length;
    st.driftTotal = (st.driftTotal || 0) + Math.round(race.player.driftScore);
    App.persist();

    /* results screen */
    $('res-title').textContent = title;
    $('res-position').textContent = race.state === 'busted' ? 'ПОГОНЯ ПРОВАЛЕНА' : U.placeRu(reward.place);
    $('res-stars').textContent = '★'.repeat(reward.stars) + '☆'.repeat(3 - reward.stars);
    $('res-time').textContent = reward.time != null ? U.formatTime(reward.time) : '—';
    $('res-bestlap').textContent = 'лучший круг ' + (race.bestLap ? U.formatTime(race.bestLap) : '—');
    $('res-money').textContent = '+' + U.formatMoney(reward.total) + ' кр.';
    var detail = $('res-detail');
    detail.innerHTML = '';
    [[U.formatMoney(reward.money), 'за место'], [U.formatMoney(reward.driftBonus), 'за дрифт'],
    [U.formatMoney(reward.timeBonus), 'бонус времени'], ['★'.repeat(reward.stars) || '—', 'звёзды']]
      .forEach(function (row) {
        var c = mk('div', 'chip');
        c.appendChild(mk('b', '', row[0]));
        c.appendChild(mk('span', 'dim', row[1]));
        detail.appendChild(c);
      });
    var table = $('res-table');
    table.innerHTML = '<tr><th>#</th><th>Гонщик</th><th>Машина</th><th>Время</th></tr>';
    results.forEach(function (row) {
      var tr = mk('tr', row.isPlayer ? 'me' : '');
      [row.position, row.name, row.car, row.time != null ? U.formatTime(row.time - (race.raceStart || 0)) : '—'].forEach(function (v) {
        tr.appendChild(mk('td', '', String(v)));
      });
      table.appendChild(tr);
    });
    $('btn-res-next').textContent = cfg.career ? 'К карьере' : 'Продолжить';
    HUD.clearToasts();
    show('s-results', true);
    NR.Audio.chime(success ? 'win' : 'lose');
  };

  /* ==================================================================
     input
     ================================================================== */
  App.applySteerMode = function () {
    var s = App.settings;
    var mode = s.steerMode || 'zones';
    var steer = $('steer');
    var tilt = $('tilt-ind');
    var pads = $('pads');
    if (steer) steer.style.display = mode === 'zones' ? 'flex' : 'none';
    if (tilt) tilt.style.display = mode === 'tilt' ? 'block' : 'none';
    var gas = $('pad-gas');
    if (gas) gas.style.display = s.autoGas ? 'none' : 'flex';
    if (mode === 'tilt' && !App.tilt.ready) App.requestTilt();
    if (pads) pads.style.opacity = '1';
    if (document.body) {
      document.body.classList.toggle('bigpads', s.padSize === 'big');
      document.body.classList.toggle('drag-steer', mode === 'drag');
    }
    App.syncFullBtn();
  };

  /* ==================================================================
     phone: fullscreen, orientation, vibration, wake lock
     ================================================================== */
  App.fullHinted = false;
  App.Full = {
    available: function () {
      var el = document.documentElement;
      return !!(el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen);
    },
    active: function () {
      return !!(document.fullscreenElement || document.webkitFullscreenElement ||
        document.mozFullScreenElement || document.msFullscreenElement);
    },
    /* просим телефон повернуть картинку в ландшафт (работает после полного экрана) */
    lock: function () {
      try {
        var o = window.screen && window.screen.orientation;
        if (o && o.lock) {
          var pr = o.lock('landscape');
          if (pr && pr.catch) pr.catch(function () { });
        }
      } catch (e) { }
    },
    enter: function (silent) {
      App.Full.lock();
      if (App.Full.active()) return true;
      var el = document.documentElement;
      var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (!fn) {
        if (!silent && !App.fullHinted) {
          App.fullHinted = true;
          HUD.toast('Полный экран: добавьте игру на главный экран', 'pink', 3600);
        }
        return false;
      }
      try {
        var res = fn.call(el, { navigationUI: 'hide' });
        if (res && res.then) res.then(function () { App.Full.lock(); App.syncFullBtn(); }, function () { App.syncFullBtn(); });
      } catch (e) { }
      App.syncFullBtn();
      return true;
    },
    exit: function () {
      var fn = document.exitFullscreen || document.webkitExitFullscreen ||
        document.mozCancelFullScreen || document.msExitFullscreen;
      try { if (fn && App.Full.active()) fn.call(document); } catch (e) { }
      App.syncFullBtn();
    },
    toggle: function () {
      if (App.Full.active()) App.Full.exit(); else App.Full.enter();
    }
  };

  App.syncFullBtn = function () {
    var b = $('btn-full');
    if (!b) return;
    var on = App.Full.active();
    b.textContent = on ? '⤡' : '⛶';
    b.classList.toggle('on', on);
    b.style.opacity = App.Full.available() ? '1' : '.55';
  };

  /* короткая вибрация на действие (на телефоне ощущается, как кнопка) */
  App.buzz = function (ms) {
    if (!App.settings || App.settings.vibrate === false) return;
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { }
  };

  /* не гасим экран во время заезда (Chrome на Android) */
  App.wakeOn = function () {
    try {
      if (!navigator.wakeLock || App.wakeSentinel) return;
      navigator.wakeLock.request('screen').then(function (sent) {
        App.wakeSentinel = sent;
        if (sent.addEventListener) sent.addEventListener('release', function () { App.wakeSentinel = null; });
      }, function () { });
    } catch (e) { }
  };
  App.wakeOff = function () {
    try { if (App.wakeSentinel && App.wakeSentinel.release) App.wakeSentinel.release(); } catch (e) { }
    App.wakeSentinel = null;
  };

  /* нажали «Старт»/«Заезд»: сначала полный экран (клик — это и есть жест,
     которого требуют браузеры), потом запуск */
  App.playFrom = function (fn) {
    if (!App.settings || App.settings.autoFull !== false) App.Full.enter();
    else App.Full.lock();
    App.clearInput();
    if (fn) fn();
  };

  App.clearInput = function () {
    var inp = App.input;
    inp.gasHeld = inp.brakeHeld = inp.driftHeld = inp.nitroHeld = false;
    inp.throttle = inp.brake = inp.handbrake = inp.nitro = 0;
    App.touch.steerL = false;
    App.touch.steerR = false;
    App.touch.drag = null;
    App.touch.steer = 0;
    var act = document.querySelectorAll('.pad.act, #steer .zone.act');
    for (var i = 0; i < act.length; i++) act[i].classList.remove('act');
  };

  App.bindHold = function (el, onDown, onUp) {
    if (!el) return;
    var active = false;
    function down(e) {
      if (e.cancelable !== false && e.preventDefault) e.preventDefault();
      if (active) return;
      active = true;
      el.classList.add('act');
      if (el.dataset && el.dataset.buzz) App.buzz(Number(el.dataset.buzz) || 12);
      onDown();
      if (el.setPointerCapture && e.pointerId != null) { try { el.setPointerCapture(e.pointerId); } catch (err) { } }
    }
    function up(e) {
      if (!active) return;
      active = false;
      el.classList.remove('act');
      onUp();
    }
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('lostpointercapture', up);
  };

  App.wireInput = function () {
    var inp = App.input;
    /* pedals */
    App.bindHold($('pad-gas'), function () { inp.gasHeld = true; }, function () { inp.gasHeld = false; });
    App.bindHold($('pad-brake'), function () { inp.brakeHeld = true; }, function () { inp.brakeHeld = false; });
    App.bindHold($('pad-drift'), function () { inp.driftHeld = true; }, function () { inp.driftHeld = false; });
    App.bindHold($('pad-nitro'), function () {
      inp.nitroHeld = true;
      App.buzz(18);
      if (App.race) NR.Audio.nitroWhoosh();
    }, function () { inp.nitroHeld = false; });
    if ($('pad-drift') && $('pad-drift').dataset) $('pad-drift').dataset.buzz = '12';

    /* steering zones */
    App.bindHold($('steer-left'), function () {
      App.touch.steerL = true;
      var z = $('steer-left'); if (z) z.classList.add('act');
    }, function () {
      App.touch.steerL = false;
      var z = $('steer-left'); if (z) z.classList.remove('act');
    });
    App.bindHold($('steer-right'), function () {
      App.touch.steerR = true;
      var z = $('steer-right'); if (z) z.classList.add('act');
    }, function () {
      App.touch.steerR = false;
      var z = $('steer-right'); if (z) z.classList.remove('act');
    });

    /* свайп-руль: отдельный слой поверх экрана (раньше события вешались на
       #s-race, а у него pointer-events:none — режим не работал вообще) */
    var layer = $('drag-layer');
    if (layer) {
      layer.addEventListener('pointerdown', function (e) {
        if (App.settings.steerMode !== 'drag') return;
        if (layer.setPointerCapture && e.pointerId != null) {
          try { layer.setPointerCapture(e.pointerId); } catch (err) { }
        }
        App.touch.drag = { id: e.pointerId == null ? null : e.pointerId, x0: e.clientX, steer: 0 };
      });
      layer.addEventListener('pointermove', function (e) {
        var d = App.touch.drag;
        if (!d) return;
        if (d.id != null && e.pointerId != null && d.id !== e.pointerId) return;
        var span = Math.max(56, window.innerWidth * 0.10);
        d.steer = U.clamp((e.clientX - d.x0) / span, -1, 1);
      });
      function endDrag(e) {
        var d = App.touch.drag;
        if (!d) return;
        if (d.id != null && e.pointerId != null && d.id !== e.pointerId) return;
        App.touch.drag = null;
      }
      layer.addEventListener('pointerup', endDrag);
      layer.addEventListener('pointercancel', endDrag);
      layer.addEventListener('lostpointercapture', endDrag);
    }

    /* полный экран вручную */
    var fullBtn = $('btn-full');
    if (fullBtn) fullBtn.addEventListener('click', function () { App.Full.toggle(); });
    var portraitBtn = $('btn-portrait-full');
    if (portraitBtn) {
      portraitBtn.addEventListener('click', function () {
        App.Full.enter();
        App.Full.lock();
        var hint = $('portrait-hint');
        if (hint) {
          hint.textContent = App.Full.active()
            ? 'Готово — поверните телефон'
            : 'Браузер не дал полный экран: поверните телефон вручную';
        }
      });
    }

    /* buttons */
    $('btn-pause').addEventListener('click', function () { App.pauseRace(); });
    $('btn-resume').addEventListener('click', function () { App.resumeRace(); });
    $('btn-restart').addEventListener('click', function () { App.playFrom(App.restartRace); });
    $('btn-pause-settings').addEventListener('click', function () { App.openSettings('paused'); });
    $('btn-quit').addEventListener('click', function () { App.quitToMenu(); });
    $('btn-settings-back').addEventListener('click', function () {
      show('s-settings', false);
      if (App.settingsFrom === 'paused') show('s-pause', true);
    });
    $('btn-res-next').addEventListener('click', function () {
      show('s-results', false);
      var cfg = App.raceConfig || {};
      if (cfg.career) App.openCareer(); else App.quitToMenu();
    });
    $('btn-res-retry').addEventListener('click', function () {
      show('s-results', false);
      App.playFrom(App.restartRace);
    });
    $('btn-res-menu').addEventListener('click', function () { show('s-results', false); App.quitToMenu(); });
    $('btn-career').addEventListener('click', function () { App.openCareer(); });
    $('btn-quick').addEventListener('click', function () { App.openQuick(); });
    $('btn-garage').addEventListener('click', function () { App.openGarage(); });
    $('btn-settings').addEventListener('click', function () { App.openSettings('menu'); });
    $('btn-stats').addEventListener('click', function () { App.openSettings('menu'); });
    $('btn-career-back').addEventListener('click', function () { App.openMenu(); });
    $('btn-quick-back').addEventListener('click', function () { App.openMenu(); });
    $('btn-garage-back').addEventListener('click', function () { App.openMenu(); });
    $('btn-quick-start').addEventListener('click', function () { App.playFrom(App.startQuick); });
    $('btn-garage-buy').addEventListener('click', function () { App.buyCar(); });
    $('btn-garage-select').addEventListener('click', function () { App.selectCar(); });
    $('btn-garage-max').addEventListener('click', function () { App.maxTune(); });
    $('set-reset').addEventListener('click', function () {
      if (!window.confirm('Сбросить весь прогресс: деньги, машины и звёзды?')) return;
      NR.Save.reset();
      App.loadSave();
      App.buildSettings();
      App.refreshMenu();
      if (App.menuScene) App.buildMenuScene();
    });

    /* keyboard (desktop preview / emulators) */
    window.addEventListener('keydown', function (e) {
      App.keys[e.code] = true;
      if (e.code === 'Escape') {
        if (App.state === 'race') App.pauseRace();
        else if (App.state === 'paused') App.resumeRace();
      }
      if (e.code === 'KeyR' && (App.state === 'race' || App.state === 'paused')) App.restartRace();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
      NR.Audio.resume();
    });
    window.addEventListener('keyup', function (e) { App.keys[e.code] = false; });

    /* audio unlock on first interaction */
    var unlock = function () {
      NR.Audio.resume();
      if (App.state === 'menu') NR.Audio.setEnabled(App.settings.sfx, App.settings.music);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    document.addEventListener('fullscreenchange', function () { App.syncFullBtn(); App.Full.lock(); });
    document.addEventListener('webkitfullscreenchange', function () { App.syncFullBtn(); App.Full.lock(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && App.state === 'race') App.pauseRace();
    });
    window.addEventListener('blur', function () {
      if (App.state === 'race') App.pauseRace();
    });
    window.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  App.readInput = function (dt) {
    var s = App.settings;
    var inp = App.input;
    var k = App.keys;
    var auto = s.autoGas !== false;
    var throttle = auto ? 1 : (inp.gasHeld ? 1 : 0);
    var brake = inp.brakeHeld ? 1 : 0;
    if (k['ArrowUp'] || k['KeyW']) throttle = 1;
    if (k['ArrowDown'] || k['KeyS']) { brake = 1; throttle = 0; }
    if (k['ShiftLeft'] || k['ShiftRight'] || k['KeyE']) inp.nitroHeld = true;
    var handbrake = inp.driftHeld || k['Space'] ? 1 : 0;

    /* ---- руль ---------------------------------------------------- */
    var mode = s.steerMode || 'zones';
    var raw = 0;
    if (mode === 'drag') {
      raw = App.touch.drag ? App.touch.drag.steer : 0;
    } else if (mode === 'tilt') {
      if (App.tilt.ready) {
        if (App.tilt.calib == null) App.tilt.calib = App.tilt.gamma;
        var g = App.tilt.gamma - App.tilt.calib;
        if (s.invertTilt) g = -g;
        raw = U.clamp(g / (s.tiltSens || 26), -1, 1);
        if (Math.abs(raw) < 0.06) raw = 0;
      }
    } else {
      if (App.touch.steerL) raw -= 1;
      if (App.touch.steerR) raw += 1;
    }
    /* клавиатура работает всегда: превью на компьютере и эмуляторы */
    if (k['ArrowLeft'] || k['KeyA']) raw -= 1;
    if (k['ArrowRight'] || k['KeyD']) raw += 1;
    raw = U.clamp(raw, -1, 1);
    /* Плавный руль: полный ход за ~0.18 с, возврат в центр за ~0.11 с.
       Мгновенный «вкл/выкл» дёргал машину, линейный разгон казался вялым. */
    var growing = Math.abs(raw) > Math.abs(App.touch.steer);
    var sameDir = raw * App.touch.steer >= 0;
    var rate = (sameDir && growing) ? 5.5 : 9;
    App.touch.steer += U.clamp(raw - App.touch.steer, -rate * dt, rate * dt);
    if (Math.abs(App.touch.steer) < 0.01 && raw === 0) App.touch.steer = 0;
    var steer = App.touch.steer;
    if (mode === 'tilt') {
      var ind = $('tilt-ind');
      if (ind && ind.firstElementChild) ind.firstElementChild.style.width = (50 + steer * 50).toFixed(0) + '%';
    }

    var nitro = (inp.nitroHeld || k['ShiftLeft'] || k['ShiftRight'] || k['KeyE']) ? 1 : 0;
    if (App.race && App.race.state === 'countdown') { throttle = 0; brake = 1; }
    return { throttle: throttle, brake: brake, steer: steer, handbrake: handbrake, nitro: nitro };
  };

  /* ==================================================================
     main loop
     ================================================================== */
  App.loop = function () {
    var last = performance.now();
    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      /* fps */
      App.fps.frames++;
      App.fps.time += dt;
      if (App.fps.time >= 0.5) {
        App.fps.value = App.fps.frames / App.fps.time;
        App.fps.frames = 0;
        App.fps.time = 0;
        App.adaptQuality();
      }
      try {
        if (App.state === 'race') {
          var input = App.readInput(dt);
          var race = App.view.update(dt, input);
          App.audio(dt, race);
          if (race && (race.state === 'finished' || race.state === 'busted')) {
            if (!App.resultsShown) { App.resultsShown = true; setTimeout(function () { App.resultsShown = false; App.finishRace(); }, 900); }
          }
        } else if (App.state === 'menu' || App.state === 'career' || App.state === 'quick' || App.state === 'garage') {
          App.updateMenuScene(dt);
          App.audio(dt, null);
        } else if (App.state === 'paused' || App.state === 'results') {
          App.audio(dt, App.race);
          if (App.state === 'paused' && App.view) App.view.updateCamera(dt * 0.15);
        } else if (App.state === 'loading') {
          App.audio(dt, null);
        }
        var scene = App.state === 'race' || App.state === 'paused' || App.state === 'results' ? App.scene : App.menuScene;
        if (scene && App.renderer) App.renderer.render(scene, App.camera);
      } catch (err) {
        App.renderErrors = (App.renderErrors || 0) + 1;
        if (window.console) console.error(err);
        if (App.renderErrors === 3) App.graphicsFallback(err);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  /* If the GPU refuses to draw (very old driver, broken shader), keep the game
     alive: drop the gradient sky for a flat clear colour and tell the player. */
  App.graphicsFallback = function (err) {
    try {
      if (App.scene && App.scene.children) {
        for (var i = App.scene.children.length - 1; i >= 0; i--) {
          var o = App.scene.children[i];
          if (o.material && o.material.isShaderMaterial) App.scene.remove(o);
        }
      }
      if (App.renderer) App.renderer.setClearColor(0x0b0f18, 1);
      HUD.toast('Упрощённая графика: ' + (err && err.message ? err.message.slice(0, 40) : 'ошибка GPU'), 'pink', 6000);
    } catch (e) { }
  };

  App.adaptQuality = function () {
    if (!App.qualityAuto) return;
    var f = App.fps.value;
    var hz = App.refreshHz || 60;
    var low = Math.min(45, hz * 0.7);
    var high = Math.min(58, hz * 0.94);
    if (f > 0 && f < low && App.pixelScale > 0.6) {
      App.pixelScale = Math.max(0.6, App.pixelScale - 0.15);
      App.applyPixelRatio();
    } else if (f > high && App.pixelScale < 1) {
      App.pixelScale = Math.min(1, App.pixelScale + 0.07);
      App.applyPixelRatio();
    }
  };

  App.audio = function (dt, race) {
    if (!NR.Audio.ready) return;
    if (race) {
      var p = race.player;
      var gearSpan = p.topSpeed / 6.2;
      var gearPos = Math.abs(p.u) / Math.max(1, gearSpan);
      var rpm = U.clamp(0.18 + (gearPos % 1) * 0.75 + U.clamp01(Math.abs(p.u) / p.topSpeed) * 0.2, 0.12, 1);
      NR.Audio.updateEngine(rpm, p.throttleVisual, race.state === 'racing');
      NR.Audio.updateSkid(p.driftAmount * (p.speed() > 5 ? 1 : 0) + (Math.abs(p.slip) > 6 ? 0.4 : 0));
      if (race.hitFlash > 0.02 && !App._hitSound) {
        NR.Audio.crash(Math.abs(race.hitFlash));
        App._hitSound = true;
        setTimeout(function () { App._hitSound = false; }, 260);
      }
    } else {
      NR.Audio.updateEngine(0.12, 0, false);
      NR.Audio.updateSkid(0);
    }
    void dt;
  };

  /* ==================================================================
     boot
     ================================================================== */
  NR.boot = function () {
    App.loadSave();
    if (!App.initRenderer()) return;
    HUD.init();
    App.wireInput();
    App.buildMenuScene();
    App.applySteerMode();
    App.measureRefresh();
    NR.Audio.init();
    NR.Audio.setEnabled(App.settings.sfx !== false, App.settings.music !== false);
    var bar = $('load-bar') ? $('load-bar').firstElementChild : null;
    if (bar) bar.style.width = '100%';
    setTimeout(function () {
      App.openMenu();
      App.loop();
    }, 260);
    /* hide the loading screen even if something goes wrong later */
    setTimeout(function () { if (App.state === 'loading' || App.state === 'boot') App.openMenu(); }, 2600);
  };
})();

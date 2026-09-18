/* NITRO RUSH — race view (camera, car visuals, effects) and HUD */
(function () {
  'use strict';
  var NR = (window.NR = window.NR || {});
  var U = NR.U;

  function $(id) { return document.getElementById(id); }

  /* ==================================================================
     HUD
     ================================================================== */
  var HUD = {
    els: {},
    cache: {},
    toasts: [],
    init: function () {
      var ids = ['hud-position', 'hud-lap', 'hud-time', 'hud-best', 'hud-gap', 'hud-speed', 'hud-gear',
        'hud-nitro', 'hud-countdown', 'hud-toast', 'hud-wrongway', 'hud-drift', 'spd-arc', 'spd-needle',
        'hud-minimap', 'hud-mode'];
      for (var i = 0; i < ids.length; i++) HUD.els[ids[i]] = $(ids[i]);
      HUD.nitroFill = HUD.els['hud-nitro'] ? HUD.els['hud-nitro'].firstElementChild : null;
      HUD.mapCtx = HUD.els['hud-minimap'] ? HUD.els['hud-minimap'].getContext('2d') : null;
    },
    set: function (id, text) {
      if (HUD.cache[id] === text) return;
      HUD.cache[id] = text;
      var e = HUD.els[id];
      if (e) e.textContent = text;
    },
    toast: function (text, kind, ms) {
      var box = HUD.els['hud-toast'];
      if (!box) return;
      var d = document.createElement('div');
      d.className = 'toast ' + (kind || '');
      d.textContent = text;
      box.appendChild(d);
      if (box.children.length > 3) box.removeChild(box.firstChild);
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, ms || 2200);
    },
    clearToasts: function () {
      var box = HUD.els['hud-toast'];
      if (box) box.innerHTML = '';
    },
    reset: function () {
      HUD.cache = {};
      HUD.clearToasts();
      HUD.set('hud-countdown', '');
      HUD.set('hud-wrongway', '');
    }
  };

  /* ==================================================================
     Race view
     ================================================================== */
  var RIVAL_COLORS = [0x2a6bd6, 0xf0c419, 0x3fbf6f, 0xd94f9c, 0x8a5cf6, 0x2ad0d0, 0xe0672a, 0xb8bcc4];

  function RaceView(app, config) {
    this.app = app;
    this.config = config;
    this.race = null;
    this.scene = null;
    this.camera = app.camera;
    this.skid = null;
    this.particles = null;
    this.visuals = [];
    this.camMode = 'intro';
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.introT = 0;
    this.fovBase = 62;
    this.mapPath = null;
    this.quality = app.quality;
    this.lastSkid = {};
  }

  RaceView.prototype.load = function (onProgress, done) {
    var self = this;
    var race = new NR.Race(self.config);
    self.race = race;
    var steps = [
      ['Трасса построена', function () {
        self.scene = NR.SceneKit.buildTrackScene(race.track, { quality: self.quality });
        self.scene.add(self.app.camera);
      }],
      ['Машины на старте', function () {
        for (var i = 0; i < race.cars.length; i++) {
          var car = race.cars[i];
          var colors;
          if (car.isPlayer) {
            var st = NR.Save.carState(car.carDef.id);
            colors = { body: self.config.color != null ? self.config.color : st.color, accent: st.accent, rim: st.rim };
          } else {
            colors = { body: RIVAL_COLORS[i % RIVAL_COLORS.length], accent: 0x14181f, rim: 0xd7dde6 };
          }
          var vis = new NR.SceneKit.CarVisual(car.carDef, colors);
          vis.baseColor = colors.body;
          vis.group.position.set(car.x, car.y, car.z);
          self.scene.add(vis.group);
          self.visuals.push(vis);
        }
      }],
      ['Дым и следы', function () {
        self.skid = new NR.SceneKit.SkidMarks(self.scene, self.quality === 'low' ? 220 : 480);
        self.particles = new NR.SceneKit.Particles(self.scene, self.quality === 'low' ? 150 : 320);
      }],
      ['Настройка света', function () {
        self.camera.fov = self.fovBase;
        self.camera.near = 0.35;
        self.camera.far = 1600;
        self.camera.updateProjectionMatrix();
        /* start behind the player for the intro shot */
        var p = race.player;
        self.camPos.set(p.x - Math.sin(p.heading) * 9, p.y + 3.6, p.z - Math.cos(p.heading) * 9);
        self.camera.position.copy(self.camPos);
        self.camLook.set(p.x, p.y + 1.2, p.z);
        self.camera.lookAt(self.camLook);
      }],
      ['Проверка позиций', function () {
        self.buildMinimap(race.track);
        HUD.reset();
        HUD.set('hud-mode', { race: 'гонка', duel: 'дуэль', timeattack: 'на время', pursuit: 'погоня' }[race.mode] || 'гонка');
      }]
    ];
    var i = 0;
    function next() {
      if (i >= steps.length) { done(); return; }
      var s = steps[i++];
      try { s[1](); } catch (e) { if (window.console) console.error('load step failed', s[0], e); }
      if (onProgress) onProgress(i / steps.length, s[0]);
      setTimeout(next, 16);
    }
    next();
  };

  RaceView.prototype.buildMinimap = function (tr) {
    var pts = [];
    var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (var i = 0; i < tr.M; i += 2) {
      pts.push(tr.px[i], tr.pz[i]);
      if (tr.px[i] < minX) minX = tr.px[i];
      if (tr.px[i] > maxX) maxX = tr.px[i];
      if (tr.pz[i] < minZ) minZ = tr.pz[i];
      if (tr.pz[i] > maxZ) maxZ = tr.pz[i];
    }
    this.mapPath = { pts: pts, minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
  };

  RaceView.prototype.drawMinimap = function (race) {
    var ctx = HUD.mapCtx, m = this.mapPath;
    if (!ctx || !m) return;
    var W = ctx.canvas.width, H = ctx.canvas.height;
    var pad = 22;
    var spanX = Math.max(1, m.maxX - m.minX), spanZ = Math.max(1, m.maxZ - m.minZ);
    var scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanZ);
    var ox = (W - spanX * scale) / 2, oz = (H - spanZ * scale) / 2;
    function tx(x) { return ox + (x - m.minX) * scale; }
    function tz(z) { return oz + (z - m.minZ) * scale; }
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.beginPath();
    for (var i = 0; i < m.pts.length; i += 2) {
      var x = tx(m.pts[i]), y = tz(m.pts[i + 1]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    /* start/finish tick */
    var s0 = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(tx(race.track.px[s0]), tz(race.track.pz[s0]), 6, 0, 6.283);
    ctx.stroke();
    /* cars */
    for (var c = 0; c < race.cars.length; c++) {
      var car = race.cars[c];
      var px = tx(car.x), py = tz(car.z);
      ctx.beginPath();
      if (car.isPlayer) {
        ctx.fillStyle = '#36ff8c';
        ctx.arc(px, py, 6.5, 0, 6.283);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = car.ai && car.ai.pursuit ? '#ff4d4d' : 'rgba(255,255,255,.85)';
        ctx.arc(px, py, 4.2, 0, 6.283);
        ctx.fill();
      }
    }
  };

  /* ------------------------------------------------------------------ */
  RaceView.prototype.update = function (dt, input) {
    var race = this.race;
    if (!race) return;
    var player = race.player;

    /* ---------------- sim ---------------- */
    race.playerInput = input;
    race.step(dt);

    /* ---------------- visuals ---------------- */
    for (var i = 0; i < this.visuals.length; i++) {
      var v = this.visuals[i];
      var car = race.cars[i];
      if (!car) continue;
      car.brakeVisual = input && car.isPlayer ? (input.brake || 0) : (car.lastAI ? car.lastAI.brake : 0);
      v.update(car, dt);
      this.emitEffects(car, v, dt);
    }

    /* ---------------- camera ---------------- */
    this.updateCamera(dt);

    /* ---------------- hud ---------------- */
    this.updateHud(race);
    this.drawMinimap(race);
    return race;
  };

  RaceView.prototype.emitEffects = function (car, vis, dt) {
    var parts = this.particles;
    if (parts) {
      var onRoad = Math.abs(car.proj.lat) < car.proj.half;
      var speed = car.speed();
      /* tyre smoke while drifting */
      if (car.drifting && speed > 6 && Math.random() < 0.7) {
        var back = 1.4;
        var bx = car.x - Math.sin(car.heading) * back, bz = car.z - Math.cos(car.heading) * back;
        parts.emit(bx + (Math.random() - 0.5) * 1.6, car.y + 0.25, bz + (Math.random() - 0.5) * 1.6,
          (Math.random() - 0.5) * 3, 1.2 + Math.random(), (Math.random() - 0.5) * 3, 0.55, 0.55, 0.6, 0.6);
      }
      /* dust when off road */
      if (!onRoad && speed > 5 && Math.random() < 0.8) {
        parts.emit(car.x - Math.sin(car.heading) * 1.2 + (Math.random() - 0.5) * 1.8, car.y + 0.2,
          car.z - Math.cos(car.heading) * 1.2 + (Math.random() - 0.5) * 1.8,
          (Math.random() - 0.5) * 2, 1.4 + Math.random(), (Math.random() - 0.5) * 2,
          car.track.theme === 'alpine' ? 0.9 : 0.72, car.track.theme === 'alpine' ? 0.92 : 0.62, car.track.theme === 'alpine' ? 0.98 : 0.42, 0.8);
      }
      /* nitro flames */
      if (car.nitroActive && Math.random() < 0.9) {
        parts.emit(car.x - Math.sin(car.heading) * 2.0, car.y + 0.55, car.z - Math.cos(car.heading) * 2.0,
          -Math.sin(car.heading) * 6 + (Math.random() - 0.5) * 2, 0.6 + Math.random(),
          -Math.cos(car.heading) * 6 + (Math.random() - 0.5) * 2, 0.35, 0.85, 1.0, 0.28);
      }
      /* landing puff */
      if (car.landingImpact > 4) {
        for (var k = 0; k < 4; k++) {
          parts.emit(car.x + (Math.random() - 0.5) * 2, car.y + 0.2, car.z + (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 4, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 4, 0.7, 0.7, 0.7, 0.5);
        }
        car.landingImpact = 0;
      }
      parts.update(dt);
    }

    /* skid marks from the rear wheels */
    if (this.skid && !car.airborne && (car.drifting || Math.abs(car.slip) > 5.5) && car.speed() > 6) {
      var key = car.isPlayer ? 'p' : 'r' + car.index;
      var prev = this.lastSkid[key];
      var half = 0.72, dirX = Math.cos(car.heading), dirZ = -Math.sin(car.heading);
      var rx = car.x - Math.sin(car.heading) * 1.35, rz = car.z - Math.cos(car.heading) * 1.35;
      var ax = rx - dirX * half, az = rz - dirZ * half;
      var bx = rx + dirX * half, bz = rz + dirZ * half;
      if (prev) {
        this.skid.pushSegment(prev.ax, prev.ay, prev.az, prev.bx, prev.by, prev.bz, ax, car.y + 0.06, az, bx, car.y + 0.06, bz);
      }
      this.lastSkid[key] = { ax: ax, ay: car.y + 0.06, az: az, bx: bx, by: car.y + 0.06, bz: bz };
    } else {
      delete this.lastSkid[car.isPlayer ? 'p' : 'r' + car.index];
    }
  };

  RaceView.prototype.updateCamera = function (dt) {
    var race = this.race;
    var p = race.player;
    var spd = p.speed();
    var cam = this.camera;

    if (race.state === 'countdown' || this.camMode === 'intro') {
      this.introT += dt;
      if (race.state !== 'countdown') this.camMode = 'chase';
      var ang = this.introT * 0.55;
      var rad = 9.2;
      var cx = p.x + Math.sin(ang) * rad;
      var cz = p.z + Math.cos(ang) * rad;
      var cy = p.y + 3.2 + Math.sin(this.introT * 0.8) * 0.5;
      this.camPos.lerp(new THREE.Vector3(cx, cy, cz), 1 - Math.exp(-6 * dt));
      cam.position.copy(this.camPos);
      this.camLook.lerp(new THREE.Vector3(p.x, p.y + 1.1, p.z), 1 - Math.exp(-8 * dt));
      cam.lookAt(this.camLook);
      return;
    }

    var dist = 7.4 + Math.min(6.5, spd * 0.075);
    var height = 2.85 + Math.min(1.5, spd * 0.012);
    var tx = p.x - Math.sin(p.heading) * dist;
    var tz = p.z - Math.cos(p.heading) * dist;
    var ty = p.y + height;
    /* keep the camera out of the ground */
    var gy = race.track.heightAt(p.proj.s) + 0.9;
    if (ty < gy) ty = gy;

    var k = 1 - Math.exp(-8.5 * dt);
    this.camPos.x += (tx - this.camPos.x) * k;
    this.camPos.y += (ty - this.camPos.y) * (1 - Math.exp(-5.5 * dt));
    this.camPos.z += (tz - this.camPos.z) * k;

    var shake = (race.hitFlash || 0) + U.clamp01((spd - 45) / 70) * 0.12;
    var sx = 0, sy = 0, sz = 0;
    if (shake > 0.001) {
      var t = performance.now() * 0.02;
      var amp = shake * 0.55;
      sx = Math.sin(t * 1.7) * amp; sy = Math.cos(t * 2.3) * amp; sz = Math.sin(t * 2.9) * amp;
    }
    cam.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z + sz);

    var lookAhead = 7 + Math.min(16, spd * 0.22);
    var lx = p.x + Math.sin(p.heading) * lookAhead;
    var lz = p.z + Math.cos(p.heading) * lookAhead;
    var ly = p.y + 1.35;
    if (this.camMode === 'finish') {
      ly = p.y + 1.6;
    }
    this.camLook.lerp(new THREE.Vector3(lx, ly, lz), 1 - Math.exp(-9 * dt));
    cam.lookAt(this.camLook);
    cam.rotation.z += U.clamp(p.rollAngle * 0.25, -0.05, 0.05);

    var fov = this.fovBase + U.clamp01(spd / 78) * 11 + (p.nitroActive ? 6 : 0);
    cam.fov += (fov - cam.fov) * (1 - Math.exp(-4 * dt));
    cam.updateProjectionMatrix();
  };

  RaceView.prototype.updateHud = function (race) {
    var p = race.player;
    var spd = Math.round(p.speed() * 3.6);
    HUD.set('hud-speed', String(spd));
    var t = U.clamp01(p.speed() / Math.max(30, p.topSpeed * 1.05));
    if (HUD.els['spd-arc']) HUD.els['spd-arc'].setAttribute('stroke-dashoffset', String(289 * (1 - t)));
    if (HUD.els['spd-needle']) HUD.els['spd-needle'].setAttribute('transform', 'rotate(' + (-90 + 180 * t).toFixed(1) + ' 110 118)');
    /* gear */
    var top = p.topSpeed;
    var gear = spd < 3 ? 'N' : String(Math.min(6, 1 + Math.floor(p.speed() / (top / 6.2))));
    HUD.set('hud-gear', gear + (p.nitroActive ? ' ⚡' : ''));
    /* nitro */
    if (HUD.nitroFill) {
      HUD.nitroFill.style.width = (p.nitro / p.nitroCap * 100).toFixed(1) + '%';
      HUD.els['hud-nitro'].className = p.nitroActive ? 'on' : '';
    }
    /* position / lap / time */
    HUD.set('hud-position', p.position + '/' + race.cars.length);
    HUD.set('hud-lap', 'Круг ' + Math.min(race.laps, p.lap + 1) + '/' + race.laps);
    var elapsed = race.state === 'countdown' ? 0 : (race.time - (race.raceStart || 0));
    HUD.set('hud-time', U.formatTime(race.state === 'countdown' ? 0 : race.time));
    HUD.set('hud-best', 'лучший круг ' + (race.bestLap ? U.formatTime(race.bestLap) : '—') + '  ·  ' + U.formatTime(elapsed));
    var gap = race.playerGapToLeader();
    HUD.set('hud-gap', race.standings[0] === p ? 'лидер' : ('-' + Math.round(gap) + ' м'));
    /* countdown */
    if (race.state === 'countdown') {
      var n = Math.ceil(race.countdown - 1);
      HUD.set('hud-countdown', String(Math.max(1, n)));
    } else if (race.goFlash > 0) {
      HUD.set('hud-countdown', 'ГАЗ!');
    } else if (HUD.cache['hud-countdown']) {
      HUD.set('hud-countdown', '');
    }
    /* drift */
    var dwrap = HUD.els['hud-drift'];
    if (dwrap) {
      if (p.drifting && p.driftTime > 0.25) {
        dwrap.style.display = 'block';
        dwrap.firstElementChild.textContent = 'ДРИФТ ' + Math.round(p.driftScore);
        dwrap.lastElementChild.textContent = 'x' + (1 + Math.min(4, Math.floor(p.driftTime))).toFixed(0);
      } else if (p.driftScore > 0 && p.driftTime === 0) {
        dwrap.style.display = 'block';
        dwrap.firstElementChild.textContent = 'ДРИФТ ' + Math.round(p.driftScore);
        dwrap.lastElementChild.textContent = 'нитро заряжено';
      } else {
        dwrap.style.display = 'none';
      }
    }
    /* wrong way */
    var ww = HUD.els['hud-wrongway'];
    if (ww) ww.style.display = race.wrongWay ? 'block' : 'none';
    /* race events -> toasts */
    while (race.events.length) {
      var ev = race.events.shift();
      if (ev.type === 'lap') HUD.toast('Круг ' + ev.lap + '/' + ev.laps + ' · ' + U.formatTime(ev.time), 'cyan');
      else if (ev.type === 'bestlap') HUD.toast('Лучший круг!', 'gold');
      else if (ev.type === 'rivalFinish') HUD.toast(ev.name + ' финишировал', 'dim');
    }
    /* nitro ready hint */
    if (!p.nitroActive && p.nitro > p.nitroCap - 0.5 && Math.random() < 0.02) HUD.toast('Нитро готово ⚡', 'green', 1200);
  };

  NR.HUD = HUD;
  NR.RaceView = RaceView;
  NR.RIVAL_COLORS = RIVAL_COLORS;
})();

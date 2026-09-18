/* NITRO RUSH — AI drivers, race director, career, rewards, save game */
(function () {
  'use strict';
  var NR = (window.NR = window.NR || {});
  var U = NR.U;

  /* ==================================================================
     AI driver
     ================================================================== */
  function AIDriver(track, opts) {
    opts = opts || {};
    this.track = track;
    this.skill = opts.skill != null ? opts.skill : 0.8;       // 0..1
    this.aggression = opts.aggression != null ? opts.aggression : 0.5;
    this.lineBias = opts.lineBias != null ? opts.lineBias : 0;  // -1..1 preference
    this.mistakeChance = opts.mistakeChance != null ? opts.mistakeChance : 0.5;
    this.rnd = U.rng(opts.seed != null ? opts.seed : 99);
    this.noise = U.makeNoise1((opts.seed || 99) * 31 + 7);
    this.mistakeTimer = 0;
    this.mistakeSteer = 0;
    this.lookAheadSmooth = 14;
    this.brakeSkill = 0.9 + this.skill * 0.1;
    this.pursuit = !!opts.pursuit;
    this.phase = this.rnd.next() * 100;
  }

  AIDriver.prototype.drive = function (car, dt, cars, playerCar) {
    var tr = this.track;
    var spd = car.speed();
    var i0 = car.proj ? car.proj.i : 0;
    var s = car.proj ? car.proj.s : 0;

    /* ---- pick a target point ahead ---- */
    var look = U.clamp(7 + spd * 0.62, 9, 72);
    var sAhead = s + look;
    var iA = tr.indexAtS(sAhead);
    var kAhead = tr.k[iA];
    var halfA = tr.half[iA];

    /* racing line: cut to the inside of the coming corner */
    var inside = U.clamp(-kAhead * 130, -1, 1);
    var latTarget = inside * Math.min(halfA * 0.62, 5.2) + this.lineBias * halfA * 0.35;

    /* ---- obstacle avoidance ---- */
    var avoid = 0;
    var list = cars || [];
    for (var ci = 0; ci < list.length; ci++) {
      var o = list[ci];
      if (o === car) continue;
      var dx = o.x - car.x, dz = o.z - car.z;
      var d = Math.hypot(dx, dz);
      if (d > 34 || d < 0.001) continue;
      var fwd = Math.cos(car.heading) * dz + Math.sin(car.heading) * dx;
      if (fwd < 1.2) continue;
      var side = Math.cos(car.heading) * dx - Math.sin(car.heading) * dz;
      var wgt = (1 - d / 34);
      avoid += -U.sign(side || (this.rnd.next() - 0.5)) * wgt * (2.6 + this.aggression * 2.2);
      if (this.pursuit && o === playerCar) {
        /* police aim straight at the player */
        avoid = side * 0.35 * (1 - d / 40);
      }
    }
    if (avoid !== 0) latTarget += U.clamp(avoid, -halfA * 0.44, halfA * 0.44);

    /* ---- mistake / wobble ---- */
    this.mistakeTimer -= dt;
    if (this.mistakeTimer <= 0) {
      this.mistakeTimer = 1.6 + this.rnd.next() * 3.4;
      if (this.rnd.next() < this.mistakeChance * 0.16) {
        this.mistakeSteer = (this.rnd.next() - 0.5) * 1.5;
        this.mistakeTimer2 = 0.35 + this.rnd.next() * 0.5;
      } else this.mistakeSteer = 0;
    }
    if (this.mistakeTimer2 > 0) { this.mistakeTimer2 -= dt; latTarget += this.mistakeSteer * 3.2; }

    /* ---- steering ---- */
    var p = tr.posAt(s, 0, {});
    var tgt = tr.posAt(sAhead, U.clamp(latTarget, -halfA * 0.85, halfA * 0.85), {});
    var desiredHeading = Math.atan2(tgt.x - car.x, tgt.z - car.z);
    var err = U.wrapAngle(desiredHeading - car.heading);
    /* when sliding, aim relative to the velocity direction (counter-steer) */
    var velDir = Math.atan2(car.u * Math.sin(car.heading) + car.wv * Math.cos(car.heading),
      car.u * Math.cos(car.heading) - car.wv * Math.sin(car.heading));
    var slipErr = U.wrapAngle(desiredHeading - velDir);
    var steer = U.clamp(err * (1.55 + 0.5 * (1 - this.skill)) + slipErr * 0.75, -1, 1);

    /* ---- target speed from upcoming curvature ---- */
    /* the AI's estimate of the cornering limit. It must stay slightly below
       what the tyre model actually delivers, otherwise the fast cars run wide. */
    var mu = (car.lastSurface || 1) * 9.81 * 1.30 * (0.86 + 0.22 * this.skill);
    var minV = 1e6;
    var horizon = U.clamp(34 + spd * 1.35, 40, 150);
    var steps = 7;
    for (var h = 0; h < steps; h++) {
      var sh = s + horizon * (h + 1) / steps;
      var ih = tr.indexAtS(sh);
      var kh = Math.abs(tr.k[ih]);
      var vh = kh > 1e-4 ? Math.sqrt(mu / kh) : 1e6;
      var sBack = (horizon - horizon * (h + 1) / steps);
      var dist = Math.max(6, sBack + 12);
      var brakeAllow = Math.sqrt(Math.max(4, vh * vh + 2 * 11.5 * this.brakeSkill * dist));
      if (brakeAllow < minV) minV = brakeAllow;
    }
    var kv = Math.abs(tr.k[tr.indexAtS(s + U.clamp(spd * 0.9, 18, 80))]);
    var immediate = kv > 1e-4 ? Math.sqrt(mu / kv) : 1e6;
    minV = Math.min(minV, immediate);

    var topEffect = car.topSpeed * (0.80 + 0.22 * this.skill);
    if (this.pursuit) topEffect *= 1.06;
    var vTarget = U.clamp(minV * (0.82 + 0.22 * this.skill), 11, topEffect);

    /* rubber band: keep the pack close to the player (arcade catch-up) */
    if (playerCar && !this.pursuit) {
      var gap = progressOf(tr, playerCar) - progressOf(tr, car);
      var band = U.clamp(gap * 0.035, -0.13, 0.19);
      vTarget *= (1 + band);
      /* never let a rival drop out of the race completely */
      if (gap > 260) vTarget *= 1.06;
    }

    /* ---- pedals ---- */
    var vErr = vTarget - spd;
    var throttle = 0, brake = 0, handbrake = 0;
    if (vErr > 0.4) throttle = U.clamp(vErr * 0.55, 0.12, 1);
    else if (vErr < -0.6) {
      brake = U.clamp(-vErr * 0.24, 0.05, 1);
      if (vErr < -6) brake = 1;
    }
    /* tight corner: handbrake for style + rotation */
    var tightK = Math.abs(tr.k[tr.indexAtS(s + 16)]);
    if (tightK > 1 / 46 && spd > Math.sqrt(mu / Math.max(tightK, 1e-4)) * 1.06 && this.skill > 0.45) {
      handbrake = 0.65;
      throttle = Math.min(throttle, 0.35);
    }

    /* nitro on straights */
    var nitro = 0;
    if (Math.abs(tr.k[iA]) < 1 / 620 && car.nitro > car.nitroCap * 0.55 && spd > car.topSpeed * 0.5) nitro = 1;

    /* pursuit police: shove the player */
    if (this.pursuit && playerCar) {
      var dp = Math.hypot(playerCar.x - car.x, playerCar.z - car.z);
      if (dp < 26) throttle = Math.max(throttle, 0.7);
    }

    return {
      throttle: throttle, brake: brake, steer: steer,
      handbrake: handbrake, nitro: nitro,
      targetSpeed: vTarget, latTarget: latTarget
    };
  };

  /* lap progression helper: total metres travelled including laps.
     Uses the monotone distance counter maintained by the race director,
     so a car sitting just before the start line is never credited with a lap. */
  function progressOf(tr, car) {
    if (car.dist != null) return car.dist;
    var lapBase = (car.finishTime != null ? tr.laps : car.lap) * tr.length;
    return lapBase + car.proj.s;
  }

  /* signed distance to the start line (-L/2 .. +L/2) */
  function relToStart(tr, car) {
    var sPos = car.proj ? car.proj.s : 0;
    return sPos > tr.length * 0.5 ? sPos - tr.length : sPos;
  }

  function initProgress(tr, car) {
    car.dist = relToStart(tr, car);
    car._lastS = car.proj ? car.proj.s : 0;
  }

  function updateProgress(tr, car) {
    var sNow = car.proj.s;
    var ds = sNow - car._lastS;
    if (ds < -tr.length * 0.5) ds += tr.length;
    else if (ds > tr.length * 0.5) ds -= tr.length;
    car._lastS = sNow;
    car.dist += ds;
  }

  /* ==================================================================
     Rivals
     ================================================================== */
  var RIVAL_NAMES = [
    'Артур Гром', 'Кира Вольт', 'Макс Драйв', 'Лена Штиль', 'Дима Нитро', 'Соня Раш',
    'Игорь Смоук', 'Аня Вихрь', 'Тимур Буст', 'Марина Тайм', 'Рома Дрифт', 'Оля Стар',
    'Влад Спарк', 'Даша Турбо', 'Костя Блейз', 'Нина Слайд'
  ];

  function makeRivals(track, count, opts) {
    opts = opts || {};
    var rnd = U.rng(opts.seed != null ? opts.seed : 4242);
    var names = U.rng(opts.seed || 4242).shuffle(RIVAL_NAMES.slice());
    var baseDifficulty = opts.difficulty != null ? opts.difficulty : 0.55;
    var rivals = [];
    for (var i = 0; i < count; i++) {
      var skill = U.clamp(baseDifficulty + (rnd.next() - 0.5) * 0.22 + (i % 3) * 0.012, 0.18, 0.985);
      rivals.push({
        id: 'rival' + i,
        name: names[i % names.length],
        carId: null,
        skill: skill,
        aggression: U.clamp(0.25 + rnd.next() * 0.6, 0, 1),
        lineBias: (rnd.next() - 0.5) * 1.2,
        mistakeChance: U.clamp(1.25 - skill, 0.1, 1),
        seed: (opts.seed || 4242) * 7 + i * 131 + 17,
        pursuit: !!opts.pursuit
      });
    }
    return rivals;
  }

  /* pick a rival car class close to the player's, scaled by difficulty */
  function rivalCarFor(rnd, playerCarIndex, difficulty) {
    var target = playerCarIndex + Math.round((difficulty - 0.5) * 5 + (rnd.next() - 0.5) * 2.4);
    var idx = U.clamp(target, 0, NR.CARS.length - 1);
    return NR.CARS[idx];
  }

  /* ==================================================================
     Race director
     ================================================================== */
  function Race(config) {
    this.track = NR.buildTrack(NR.trackById(config.trackId));
    this.config = config;
    this.laps = config.laps || this.track.laps;
    this.track.laps = this.laps;
    this.mode = config.mode || 'race';
    this.difficulty = config.difficulty != null ? config.difficulty : 0.55;
    this.rnd = U.rng(config.seed != null ? config.seed : 777);
    this.time = 0;
    this.state = 'countdown';
    this.countdown = 3.99;
    this.goFlash = 0;
    this.finished = false;
    this.results = null;
    this.events = [];      // transient event queue for HUD/toasts
    this.lapTimes = [];
    this.lastLapStart = 0;
    this.wrongWayTimer = 0;
    this.wrongWay = false;
    this.bestLap = null;
    this.cars = [];
    this.physicsSteps = 0;

    var tr = this.track;
    var nRivals = (config.rivals && config.rivals.length) ? config.rivals.length : 0;
    var grid = tr.startGrid(nRivals + 1);

    /* player */
    var pStats = NR.CarFactory.statsFor(config.playerCar, config.upgrades);
    this.player = new NR.Vehicle(tr, pStats, { assist: config.assist != null ? config.assist : 0.9 });
    this.player.isPlayer = true;
    this.player.placeAt(grid[0].s, grid[0].lat);
    this.player.name = 'Вы';
    this.player.color = config.color || 0xd11f2f;
    this.player.carDef = config.playerCar;
    this.player.lap = 0;
    this.player.nextCp = 0;
    this.player.finishTime = null;
    this.player.position = 1;
    this.player.damage = 0;
    initProgress(tr, this.player);
    this.cars.push(this.player);

    /* rivals */
    var rivalDefs = (config.rivals && config.rivals.length) ? config.rivals : [];
    this.rivals = [];
    for (var i = 0; i < rivalDefs.length; i++) {
      var rd = rivalDefs[i];
      var car = rd.car || rivalCarFor(this.rnd, NR.CarFactory.indexOf(config.playerCar.id), this.difficulty);
      var upg = {};
      var ups = Math.round(this.difficulty * 4);
      upg.engine = ups; upg.gearbox = ups; upg.tires = Math.floor(ups * 0.7); upg.nitro = Math.max(0, ups - 1);
      var st = NR.CarFactory.statsFor(car, upg);
      var veh = new NR.Vehicle(tr, st, { assist: 0.75, isAI: true });
      var g = grid[(i + 1) % grid.length];
      veh.placeAt(g.s, g.lat);
      veh.name = rd.name;
      veh.carDef = car;
      veh.color = rd.color != null ? rd.color : 0x2a6bd6;
      veh.lap = 0;
      veh.nextCp = 0;
      veh.finishTime = null;
      veh.position = 2 + i;
      veh.damage = 0;
      initProgress(tr, veh);
      veh.ai = new AIDriver(tr, {
        skill: rd.skill, aggression: rd.aggression, lineBias: rd.lineBias,
        mistakeChance: rd.mistakeChance, seed: rd.seed, pursuit: rd.pursuit
      });
      veh.isRival = true;
      veh.index = i;
      this.cars.push(veh);
      this.rivals.push(veh);
    }
    this.standings = this.cars.slice();
    this.playerMaxDamage = this.mode === 'pursuit' ? 100 : 0;
    this.autoPilot = !!config.autoPilot;
    if (this.autoPilot) {
      this.player.ai = new AIDriver(this.track, {
        skill: config.autoPilotSkill != null ? config.autoPilotSkill : 0.85,
        aggression: 0.55, lineBias: 0, mistakeChance: 0.3, seed: (config.seed || 777) + 11
      });
    }
  }

  Race.prototype.stepPhysics = function (dt) {
    var input = this.playerInput || { throttle: 0, brake: 0, steer: 0, handbrake: 0, nitro: 0 };
    var cars = this.cars;

    /* player: human input, or the demo/auto-pilot driver */
    if (this.autoPilot && this.player.ai) input = this.player.ai.drive(this.player, dt, cars, null);
    else if (this.playerInput) input = this.playerInput;

    /* rivals */
    var rivalInputs = [];
    for (var i = 0; i < this.rivals.length; i++) {
      var r = this.rivals[i];
      var ai = r.ai.drive(r, dt, cars, this.player);
      r.lastAI = ai;
      rivalInputs.push(ai);
    }

    /* everyone is frozen on the grid until the lights go out */
    if (this.state === 'countdown') {
      input = { throttle: 0, brake: 1, steer: 0, handbrake: 1, nitro: 0 };
      for (var ri = 0; ri < rivalInputs.length; ri++) rivalInputs[ri] = input;
      this.playerLastInput = input;
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.state = 'racing';
        this.goFlash = 1.0;
        this.raceStart = this.time;
        this.launchTime = this.time;
      }
    }

    if (this.state !== 'countdown') this.time += dt;
    if (this.goFlash > 0) this.goFlash -= dt;

    this.player.step(dt, input);
    this.applyTrackLimits(this.player, dt);

    for (var k = 0; k < this.rivals.length; k++) {
      this.rivals[k].step(dt, rivalInputs[k]);
      this.applyTrackLimits(this.rivals[k], dt);
    }

    /* launch bonus: perfect start while the tyres still bite */
    if (this.state === 'racing' && this.playerInput && this.playerInput.throttle > 0.5 &&
      this.launchTime != null && this.player.launchWindow == null && this.player.speed() < 6) {
      this.player.launchWindow = 0;
    }

    /* car-car collisions (few cars: brute force over relevant pairs) */
    for (var a = 0; a < cars.length; a++) {
      for (var b = a + 1; b < cars.length; b++) {
        var ca = cars[a], cb = cars[b];
        if (Math.abs(ca.proj.s - cb.proj.s) > 8 && ca.lap === cb.lap) continue;
        if (U.dist2sq(ca.x, ca.z, cb.x, cb.z) > 12) continue;
        if (NR.collideVehicles(ca, cb, dt)) {
          if (ca.isPlayer || cb.isPlayer) {
            var other = ca.isPlayer ? cb : ca;
            var isCop = other.ai && other.ai.pursuit;
            if (isCop) {
              this.player.damage += 6.5;
              this.hitFlash = 0.45;
            } else {
              this.player.damage += 1.2;
            }
          }
          this.events.push({ t: this.time, type: 'bump' });
        }
      }
    }

    /* lap logic + monotone progress */
    for (var c = 0; c < cars.length; c++) {
      this.updateLap(cars[c]);
      updateProgress(this.track, cars[c]);
    }

    /* standings */
    this.updateStandings();

    /* pursuit damage decay + busted check */
    if (this.mode === 'pursuit') {
      /* repair slowly while driving clean */
      this.player.damage = Math.max(0, this.player.damage - dt * 0.55);
      if (this.player.damage >= 100 && this.state === 'racing') {
        this.state = 'busted';
        this.finished = true;
        this.finishReason = 'damage';
      }
    }

    this.physicsSteps++;
  };

  Race.prototype.applyTrackLimits = function (car, dt) {
    var tr = this.track;
    var over = Math.abs(car.proj.lat) - (car.proj.half + 0.35);
    if (over <= 0) { car.wallTimer = Math.max(0, (car.wallTimer || 0) - dt); return; }
    var i = car.proj.i;
    var nnx = tr.nx[i], nnz = tr.nz[i];
    var sgn = U.sign(car.proj.lat) || 1;
    /* push back to the barrier */
    var push = Math.min(over, 1.6);
    car.x -= nnx * sgn * push;
    car.z -= nnz * sgn * push;
    /* reflect the normal component of local velocity */
    var c = Math.cos(car.heading), s = Math.sin(car.heading);
    var vx = car.u * s + car.wv * c;
    var vz = car.u * c - car.wv * s;
    var vn = vx * nnx + vz * nnz;
    if (vn * sgn > 0) {
      var vnRed = vn * 0.42;                     // wall absorbs most of it
      vx -= nnx * vn * (1 + 0.42) * (vn * sgn > 0 ? 1 : 0) * 1;
      vz -= nnz * vn * (1 + 0.42) * (vn * sgn > 0 ? 1 : 0) * 1;
      var newU = vx * s + vz * c;
      var newW = vx * c - vz * s;
      var loss = U.clamp01(Math.abs(vnRed) / 18);
      car.u = newU * (1 - loss * 0.30);
      car.wv = newW * (1 - loss * 0.5);
      car.hitWall = Math.max(car.hitWall || 0, U.clamp01(loss * 2.2));
      car.wallTimer = 0.35;
      if (car.isPlayer && loss > 0.12) this.hitFlash = Math.max(this.hitFlash || 0, 0.25);
    }
  };

  Race.prototype.updateLap = function (car) {
    var tr = this.track;
    if (car.finishTime != null) return;
    var i = car.proj.i;
    /* checkpoints force a full lap */
    if (car.nextCp < tr.checkpoints.length) {
      var cp = tr.checkpoints[car.nextCp];
      if (i >= cp.i - 2 && i <= cp.i + 2) car.nextCp++;
    }
    if (i < 4 || i > tr.M - 4) {
      if (car.finishTime == null) {
        if (car.nextCp >= tr.checkpoints.length) {
          car.lap++;
          if (car.isPlayer) {
            var lapT = this.time - this.lastLapStart;
            this.lapTimes.push(lapT);
            if (this.bestLap == null || lapT < this.bestLap) { this.bestLap = lapT; this.events.push({ t: this.time, type: 'bestlap' }); }
            this.lastLapStart = this.time;
            this.events.push({ t: this.time, type: 'lap', lap: car.lap, laps: tr.laps, time: lapT });
          }
          car.nextCp = 0;
          if (car.lap >= tr.laps) {
            car.finishTime = this.time;
            if (car.isPlayer) {
              this.state = 'finished';
              this.finished = true;
              this.finishTime = this.time;
              this.events.push({ t: this.time, type: 'finish' });
            } else {
              this.events.push({ t: this.time, type: 'rivalFinish', name: car.name });
            }
          }
        }
      }
    }
  };

  Race.prototype.updateStandings = function () {
    var tr = this.track;
    var arr = this.cars.slice();
    arr.sort(function (a, b) {
      var fa = a.finishTime != null, fb = b.finishTime != null;
      if (fa && fb) return a.finishTime - b.finishTime;
      if (fa) return -1;
      if (fb) return 1;
      var pa = progressOf(tr, a), pb = progressOf(tr, b);
      return pb - pa;
    });
    for (var i = 0; i < arr.length; i++) arr[i].position = i + 1;
    this.standings = arr;
  };

  Race.prototype.step = function (dt) {
    /* fixed timestep physics with accumulator for stability */
    var MAX_DT = 1 / 90;
    this.acc = (this.acc || 0) + dt;
    var guard = 0;
    while (this.acc >= MAX_DT && guard < 6) {
      this.stepPhysics(MAX_DT);
      this.acc -= MAX_DT;
      guard++;
    }
    if (guard >= 6) this.acc = 0;
    /* feedback: wrong way */
    var dot = this.player.u * Math.sin(this.player.heading) * this.track.tx[this.player.proj.i] +
      this.player.u * Math.cos(this.player.heading) * this.track.tz[this.player.proj.i];
    var fwdDot = (Math.sin(this.player.heading) * this.track.tx[this.player.proj.i]) +
      (Math.cos(this.player.heading) * this.track.tz[this.player.proj.i]);
    if (this.state === 'racing' && fwdDot < -0.25 && this.player.speed() > 4) {
      this.wrongWayTimer += dt;
      this.wrongWay = this.wrongWayTimer > 1.1;
    } else {
      this.wrongWayTimer = 0;
      this.wrongWay = false;
    }
    /* drain transient events */
    var out = [];
    for (var i = this.events.length - 1; i >= 0; i--) {
      if (this.time - this.events[i].t > 3.5) { out.push(this.events[i]); this.events.splice(i, 1); }
    }
    return dt;
  };

  Race.prototype.elapsed = function () {
    return this.time;
  };

  Race.prototype.playerGapToLeader = function () {
    var tr = this.track;
    if (this.standings[0] === this.player) return 0;
    var lead = progressOf(tr, this.standings[0]);
    var me = progressOf(tr, this.player);
    return lead - me;
  };

  /* result table with prize breakdown */
  Race.prototype.buildResults = function () {
    var tr = this.track;
    var arr = this.cars.slice().sort(function (a, b) {
      var fa = a.finishTime != null, fb = b.finishTime != null;
      if (fa && fb) return a.finishTime - b.finishTime;
      if (fa) return -1;
      if (fb) return 1;
      return progressOf(tr, b) - progressOf(tr, a);
    });
    var rows = [];
    for (var i = 0; i < arr.length; i++) {
      var c = arr[i];
      rows.push({
        position: i + 1,
        name: c.isPlayer ? 'ВЫ' : c.name,
        isPlayer: !!c.isPlayer,
        car: c.carDef ? c.carDef.name : '—',
        time: c.finishTime != null ? c.finishTime - (this.raceStart || 0) : null,
        lap: c.lap,
        progress: progressOf(tr, c),
        crashed: false
      });
    }
    return rows;
  };

  /* ==================================================================
     Rewards & progression
     ================================================================== */
  function computeReward(race, results, opts) {
    opts = opts || {};
    var playerRow = null;
    for (var i = 0; i < results.length; i++) if (results[i].isPlayer) playerRow = results[i];
    var place = playerRow ? playerRow.position : results.length;
    var base = 900 + race.track.length * 1.05;
    var placeMul = [1, 0.74, 0.58, 0.46, 0.38, 0.32, 0.27, 0.23][Math.min(place - 1, 7)] || 0.2;
    var diffMul = 0.85 + race.difficulty * 0.5;
    var money = Math.round(base * placeMul * diffMul / 10) * 10;
    var driftBonus = Math.round(race.player.driftScore * (10 + race.difficulty * 8));
    var timeBonus = 0;
    if (opts.targetTime && playerRow && playerRow.time && playerRow.time < opts.targetTime) {
      timeBonus = Math.round(base * 0.45);
    }
    var stars = 0;
    var target = opts.targetPlace || 3;
    if (place <= target) stars = 1;
    if (place <= Math.max(1, target - 1)) stars = 2;
    if (place === 1) stars = 3;
    if (opts.starBonus && place === 1) stars = 3;

    return {
      place: place, money: money, drift: race.player.driftScore,
      driftBonus: driftBonus, timeBonus: timeBonus,
      total: money + driftBonus + timeBonus, stars: stars,
      bestLap: race.bestLap, time: playerRow && playerRow.time,
      target: target
    };
  }

  /* ==================================================================
     Save game
     ================================================================== */
  var SAVE_KEY = 'nitrorush.save.v1';
  var DEFAULT_SAVE = {
    money: 6000,
    selectedCar: 'vihr',
    cars: { vihr: { owned: true, upgrades: {}, color: 0xd11f2f, accent: 0x14181f, rim: 0xd7dde6 } },
    career: {},
    settings: { assist: 0.9, quality: 'auto', sfx: true, music: true, steerMode: 'auto', invertTilt: false },
    stats: { races: 0, wins: 0, distance: 0, driftTotal: 0, bestTimes: {} }
  };

  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

  var Save = {
    data: deepCopy(DEFAULT_SAVE),
    load: function (storage) {
      var s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      if (!s) return this.data;
      try {
        var raw = s.getItem(SAVE_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== 'object') throw new Error('bad save');
          this.data = Object.assign(deepCopy(DEFAULT_SAVE), parsed);
          this.data.settings = Object.assign(deepCopy(DEFAULT_SAVE.settings), parsed.settings || {});
          this.data.stats = Object.assign(deepCopy(DEFAULT_SAVE.stats), parsed.stats || {});
          this.data.cars = parsed.cars || deepCopy(DEFAULT_SAVE.cars);
          if (!this.data.cars[this.data.selectedCar]) this.data.selectedCar = 'vihr';
        }
      } catch (e) { this.data = deepCopy(DEFAULT_SAVE); }
      return this.data;
    },
    save: function (storage) {
      var s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      if (!s) return;
      try { s.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { }
    },
    reset: function (storage) {
      this.data = deepCopy(DEFAULT_SAVE);
      this.save(storage);
      return this.data;
    },
    carState: function (id) {
      if (!this.data.cars[id]) this.data.cars[id] = { owned: false, upgrades: {}, color: 0xd11f2f, accent: 0x14181f, rim: 0xd7dde6 };
      return this.data.cars[id];
    },
    owned: function (id) { return !!(this.data.cars[id] && this.data.cars[id].owned); },
    currentCar: function () { return NR.CarFactory.carById(this.data.selectedCar); },
    currentStats: function () { return NR.CarFactory.statsFor(this.currentCar(), this.carState(this.data.selectedCar).upgrades); }
  };

  /* ==================================================================
     Career / series
     ================================================================== */
  var SERIES = [
    {
      id: 's1', name: 'Уличная лига', open: true,
      events: [
        { id: 's1e1', name: 'Ночная разминка', track: 'city', laps: 2, rivals: 3, difficulty: 0.34, targetPlace: 3, mode: 'race' },
        { id: 's1e2', name: 'Прибрежный спринт', track: 'coast', laps: 2, rivals: 3, difficulty: 0.38, targetPlace: 3, mode: 'race' },
        { id: 's1e3', name: 'Дуэль в порту', track: 'coast', laps: 2, rivals: 1, difficulty: 0.52, targetPlace: 1, mode: 'duel' },
        { id: 's1e4', name: 'Заезд на время', track: 'city', laps: 2, rivals: 0, difficulty: 0.42, targetPlace: 1, mode: 'timeattack', targetTime: 118 }
      ]
    },
    {
      id: 's2', name: 'Кубок пустыни', open: false,
      events: [
        { id: 's2e1', name: 'Песчаная прямая', track: 'desert', laps: 2, rivals: 4, difficulty: 0.46, targetPlace: 3, mode: 'race' },
        { id: 's2e2', name: 'Пыль и жара', track: 'desert', laps: 3, rivals: 4, difficulty: 0.52, targetPlace: 2, mode: 'race' },
        { id: 's2e3', name: 'Обратный заезд', track: 'industry', laps: 2, rivals: 1, difficulty: 0.6, targetPlace: 1, mode: 'duel' },
        { id: 's2e4', name: 'Погоня в промзоне', track: 'industry', laps: 3, rivals: 3, difficulty: 0.55, targetPlace: 3, mode: 'pursuit', cops: 3, lapsToSurvive: 3 }
      ]
    },
    {
      id: 's3', name: 'Горная серия', open: false,
      events: [
        { id: 's3e1', name: 'Серпантин', track: 'mountain', laps: 2, rivals: 4, difficulty: 0.56, targetPlace: 3, mode: 'race' },
        { id: 's3e2', name: 'Вираж над пропастью', track: 'mountain', laps: 3, rivals: 5, difficulty: 0.62, targetPlace: 3, mode: 'race' },
        { id: 's3e3', name: 'Ледяная дуга', track: 'alpine', laps: 2, rivals: 4, difficulty: 0.66, targetPlace: 2, mode: 'race' },
        { id: 's3e4', name: 'Хроно на перевале', track: 'alpine', laps: 3, rivals: 0, difficulty: 0.6, targetPlace: 1, mode: 'timeattack', targetTime: 205 }
      ]
    },
    {
      id: 's4', name: 'Мастер-тур', open: false,
      events: [
        { id: 's4e1', name: 'Гран-при города', track: 'city', laps: 3, rivals: 5, difficulty: 0.7, targetPlace: 3, mode: 'race' },
        { id: 's4e2', name: 'Пустынный марафон', track: 'desert', laps: 4, rivals: 5, difficulty: 0.74, targetPlace: 2, mode: 'race' },
        { id: 's4e3', name: 'Погоня высшего уровня', track: 'coast', laps: 3, rivals: 4, difficulty: 0.72, targetPlace: 3, mode: 'pursuit', cops: 4, lapsToSurvive: 3 },
        { id: 's4e4', name: 'Альпийский финал', track: 'alpine', laps: 4, rivals: 5, difficulty: 0.8, targetPlace: 2, mode: 'race' }
      ]
    },
    {
      id: 's5', name: 'Легенды NITRO', open: false,
      events: [
        { id: 's5e1', name: 'Промзона X', track: 'industry', laps: 4, rivals: 6, difficulty: 0.84, targetPlace: 3, mode: 'race' },
        { id: 's5e2', name: 'Ночной Токио', track: 'city', laps: 4, rivals: 6, difficulty: 0.88, targetPlace: 2, mode: 'race' },
        { id: 's5e3', name: 'Снежный ад', track: 'alpine', laps: 5, rivals: 6, difficulty: 0.9, targetPlace: 2, mode: 'race' },
        { id: 's5e4', name: 'Финальная дуэль', track: 'desert', laps: 3, rivals: 1, difficulty: 0.95, targetPlace: 1, mode: 'duel' }
      ]
    }
  ];

  function seriesProgress(save, seriesId) {
    var s = null;
    for (var i = 0; i < SERIES.length; i++) if (SERIES[i].id === seriesId) s = SERIES[i];
    if (!s) return { stars: 0, max: 0, done: 0, total: s ? s.events.length : 0 };
    var stars = 0, done = 0;
    for (var j = 0; j < s.events.length; j++) {
      var rec = save.career[s.events[j].id];
      if (rec) { stars += rec.stars || 0; if (rec.stars > 0) done++; }
    }
    return { stars: stars, max: s.events.length * 3, done: done, total: s.events.length };
  }

  function isSeriesUnlocked(save, index) {
    if (index === 0) return true;
    var prev = SERIES[index - 1];
    var need = Math.ceil(prev.events.length * 1.4);   // stars needed from previous series
    return seriesProgress(save, prev.id).stars >= need;
  }

  function isEventUnlocked(save, series, index) {
    if (index === 0) return true;
    var prev = series.events[index - 1];
    var rec = save.career[prev.id];
    return !!(rec && rec.stars > 0);
  }

  function totalStars(save) {
    var t = 0;
    for (var k in save.career) if (save.career[k]) t += save.career[k].stars || 0;
    return t;
  }

  NR.AIDriver = AIDriver;
  NR.Race = Race;
  NR.makeRivals = makeRivals;
  NR.rivalCarFor = rivalCarFor;
  NR.computeReward = computeReward;
  NR.Save = Save;
  NR.SERIES = SERIES;
  NR.seriesProgress = seriesProgress;
  NR.isSeriesUnlocked = isSeriesUnlocked;
  NR.isEventUnlocked = isEventUnlocked;
  NR.totalStars = totalStars;
  NR.progressOf = progressOf;
  NR.SAVE_KEY = SAVE_KEY;
  NR.DEFAULT_SAVE = DEFAULT_SAVE;
})();

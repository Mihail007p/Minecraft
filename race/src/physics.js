/* NITRO RUSH — arcade vehicle physics (two-axle slip model + arcade assists) */
(function () {
  'use strict';
  var NR = (window.NR = window.NR || {});
  var U = NR.U;

  var G = 9.81;

  /* surface friction per point (theme based, with deterministic patches) */
  function surfaceFor(track) {
    if (track._surface) return track._surface;
    var theme = track.theme;
    var base = { city: 1.00, coast: 0.98, mountain: 0.95, desert: 0.96, industry: 1.00, alpine: 0.88 }[theme] || 0.98;
    var noise = U.makeNoise1(1337 + track.def.ctrl.length);
    var arr = new Float32Array(track.M);
    for (var i = 0; i < track.M; i++) {
      var v = base + noise(i * 0.06) * 0.05 + noise(i * 0.017 + 40) * 0.07;
      if (theme === 'alpine') {
        var ice = noise(i * 0.011 + 900);
        if (ice > 0.45) v = U.lerp(v, 0.62, U.clamp01((ice - 0.45) / 0.4));
      }
      arr[i] = U.clamp(v, 0.55, 1.12);
    }
    /* light smoothing */
    var out = new Float32Array(track.M);
    for (var j = 0; j < track.M; j++) {
      out[j] = (arr[(j - 1 + track.M) % track.M] + 2 * arr[j] + arr[(j + 1) % track.M]) * 0.25;
    }
    track._surface = out;
    return out;
  }

  var OFFROAD = { grip: 0.66, drag: 0.0042, engine: 0.62 };

  function Vehicle(track, stats, opts) {
    opts = opts || {};
    this.track = track;
    this.stats = stats;
    this.mass = stats.mass || 1250;
    this.topSpeed = stats.topSpeedMs || 60;
    this.a0 = stats.a0 || (27.78 / Math.max(2.0, stats.accel)) * 1.15;
    this.engineForce = stats.force || this.mass * this.a0;
    this.dragC = stats.dragK || this.engineForce * 0.82 / (this.topSpeed * this.topSpeed);
    this.rollC = stats.rollK || this.engineForce * 0.18 / this.topSpeed;
    this.brakeForce = this.mass * 13.5;
    this.handbrakeForce = this.mass * 7.0;
    this.gripMul = stats.handling || 1.0;
    this.nitroPower = stats.nitroPower || 0.2;
    this.nitroCap = stats.nitroCapacity || 100;

    this.a = 1.32;                        // CoM to front axle
    this.b = 1.38;                        // CoM to rear axle
    this.wheelbase = this.a + this.b;
    this.trackW = 1.6;
    this.Iz = this.mass * (this.wheelbase * this.wheelbase) / 12 * 1.25;
    this.Cf = this.mass * 9.0 * this.gripMul;
    this.Cr = this.mass * 10.4 * this.gripMul;
    this.h = 0.55;                        // CoM height

    this.maxSteer = 0.52;                 // rad at wheels
    this.steerRate = 3.4;
    this.assist = opts.assist != null ? opts.assist : 0.85;
    this.isAI = !!opts.isAI;

    /* state */
    this.x = 0; this.y = 0; this.z = 0;
    this.heading = 0;
    this.yawRate = 0;
    this.u = 0;                           // local longitudinal velocity
    this.wv = 0;                          // local lateral velocity
    this.vy = 0;                          // world vertical velocity
    this.airborne = false;
    this.steer = 0;
    this.rollAngle = 0;
    this.pitchAngle = 0;
    this.wheelSteer = 0;
    this.wheelSpin = 0;
    this.slip = 0;
    this.driftAmount = 0;
    this.drifting = false;
    this.driftTime = 0;
    this.driftScore = 0;
    this.airTime = 0;
    this.nitro = this.nitroCap;
    this.nitroActive = false;
    this.boostTimer = 0;
    this.onGround = true;
    this.massScale = 1;
    this.speedLoss = 0;
    this.lap = 0;
    this.offroadTime = 0;
    this.hitWall = 0;
    this.wallTimer = 0;
    this.engineRpm = 0.15;
    this.accelG = 0;
    this.lateralG = 0;
    this.elapsed = 0;
    this.rampBoostY = 0;
    this.bounceCount = 0;
    this.lastSurface = 1;
    this.throttleVisual = 0;
    this._proj = {};
    this.surface = surfaceFor(track);
  }

  var _cosH = 1, _sinH = 0;

  Vehicle.prototype.placeAt = function (s, lat, headingOverride) {
    var p = this.track.posAt(s, lat, {});
    this.x = p.x; this.z = p.z; this.y = p.y;
    this.heading = headingOverride != null ? headingOverride : p.heading;
    this.u = 0; this.wv = 0; this.yawRate = 0; this.vy = 0;
    this.airborne = false; this.onGround = true;
    this._hint = this.track.indexAtS(s);
    this.proj = this.track.project(this.x, this.z, this._hint, this._proj);
    return this;
  };

  Vehicle.prototype.localVec = function () {
    _cosH = Math.cos(this.heading); _sinH = Math.sin(this.heading);
    return { s: _sinH, c: _cosH };
  };

  /* world velocity from local */
  Vehicle.prototype.worldVel = function (out) {
    out = out || {};
    var c = Math.cos(this.heading), s = Math.sin(this.heading);
    out.x = this.u * s + this.wv * c;
    out.z = this.u * c - this.wv * s;
    out.y = this.vy;
    return out;
  };

  Vehicle.prototype.speed = function () { return Math.hypot(this.u, this.wv); };

  Vehicle.prototype.step = function (dt, input) {
    var tr = this.track;
    var surface = this.surface;
    this.elapsed += dt;

    /* ---- steering input smoothing ---- */
    var steerTarget = U.clamp(input.steer || 0, -1, 1);
    var maxRate = this.steerRate * (this.isAI ? 1.35 : 1.0);
    this.steer += U.clamp(steerTarget - this.steer, -maxRate * dt, maxRate * dt);
    /* speed sensitive steering lock */
    var spd = this.speed();
    var lock = this.maxSteer * U.lerp(1.0, 0.42, U.clamp01(spd / 62));
    this.wheelSteer = this.steer * lock;

    /* ---- surface / projection ---- */
    this.proj = tr.project(this.x, this.z, this._hint, this._proj);
    this._hint = this.proj.i;
    var over = Math.abs(this.proj.lat) - this.proj.half;
    var onTrack = over <= 0.15;
    if (onTrack) this.offroadTime = Math.max(0, this.offroadTime - dt * 2);
    else this.offroadTime += dt;
    var fr = surface[this.proj.i] || 0.98;
    if (!onTrack) fr *= OFFROAD.grip * U.clamp(1 - (over - 0.15) * 0.04, 0.55, 1);
    this.lastSurface = fr;

    /* ---- ramp detection (fast path) ---- */
    var rampLift = 0;
    var onRamp = null;
    for (var ri = 0; ri < tr.ramps.length; ri++) {
      var R = tr.ramps[ri];
      var along = (this.x - R.x) * R.tx + (this.z - R.z) * R.tz;
      var latr = Math.abs((this.x - R.x) * -R.tz + (this.z - R.z) * R.tx);
      if (Math.abs(along) < R.len * 0.62 && latr < R.half + 1.0) {
        var tt = U.clamp01((along + R.len * 0.5) / R.len);
        var h = tt * R.height * R.dir;
        if (h > rampLift) rampLift = h;
        if (tt > 0.55 && tt > (this.rampProgress || 0)) onRamp = { R: R, tt: tt, dir: R.dir };
      }
    }
    this.rampProgress = onRamp ? onRamp.tt : 0;

    /* ---- longitudinal forces ---- */
    var throttle = U.clamp(input.throttle || 0, 0, 1);
    var brake = U.clamp(input.brake || 0, 0, 1);
    this.throttleVisual = throttle;

    var engine = this.engineForce * throttle * (onTrack ? 1 : OFFROAD.engine);
    if (this.u < 0) engine *= 0.35;   // reverse throttle

    var nitro = U.clamp(input.nitro || 0, 0, 1);
    this.nitroActive = false;
    if (nitro > 0 && this.nitro > 0.5 && this.u > 1) {
      var nf = this.engineForce * (1.15 + this.nitroPower * 2.2) * nitro;
      engine += nf;
      this.nitro = Math.max(0, this.nitro - dt * 26 * (1 + nitro * 0.2));
      this.nitroActive = true;
      this.dragBoost = 0.70;
    } else {
      this.dragBoost = 1.0;
      if (this.u > 2 && throttle > 0.4) this.nitro = Math.min(this.nitroCap, this.nitro + dt * 6.6);
      else this.nitro = Math.min(this.nitroCap, this.nitro + dt * 2.2);
    }

    var brakeF = 0;
    if (brake > 0) {
      if (this.u > 0.6) brakeF = -this.brakeForce * brake;
      else if (throttle < 0.1) { engine = -this.engineForce * 0.42 * brake; brakeF = 0; }
    }
    var roll = -this.rollC * this.u;
    var drag = -this.dragC * (this.dragBoost == null ? 1 : this.dragBoost) * this.u * Math.abs(this.u);
    var extraDrag = 0;
    if (!onTrack) {
      extraDrag = -OFFROAD.drag * this.mass * this.u * Math.abs(this.u) * 2.4;
      if (onTrack === false && this.offroadTime > 0.4) extraDrag -= this.mass * 3.0 * U.sign(this.u);
    }

    var Fdrag = roll + drag + extraDrag;

    /* ---- traction circle: longitudinal use limits lateral grip ---- */
    var totalLong = engine + brakeF;
    var useRatio = Math.min(0.85, Math.abs(totalLong) / (this.mass * G * 1.45));
    var latCap = 1 - 0.30 * useRatio * useRatio;

    var fxTotal = totalLong + Fdrag;

    /* ---- axle lateral forces (slip-angle model) ---- */
    var uAbs = Math.max(Math.abs(this.u), 1.2);
    var sgn = this.u >= 0 ? 1 : -1;
    var alphaF = Math.atan((this.wv + this.yawRate * this.a) / uAbs) - this.wheelSteer * sgn;
    var alphaR = Math.atan((this.wv - this.yawRate * this.b) / uAbs);

    /* load transfer (simple) */
    var driveAccel = fxTotal / this.mass;
    var loadFront = 0.5 - (driveAccel * this.h) / (this.wheelbase * G) * 0.5;
    var loadRear = 0.5 + (driveAccel * this.h) / (this.wheelbase * G) * 0.5;
    loadFront = U.clamp(loadFront, 0.15, 0.85);
    loadRear = U.clamp(loadRear, 0.15, 0.85);

    var gripF = fr * G * this.mass * loadFront * 1.55 * latCap;
    var gripR = fr * G * this.mass * loadRear * 1.55 * latCap;
    var handbrake = U.clamp(input.handbrake || 0, 0, 1);
    if (handbrake > 0) gripR *= U.lerp(1, 0.34, handbrake);
    if (this.isAI) gripR *= 1.06;

    var Fyf = U.clamp(-this.Cf * alphaF, -gripF, gripF);
    var Fyr = U.clamp(-this.Cr * alphaR, -gripR, gripR);

    /* ---- assists: keep drifts controllable (Asphalt-style) ---- */
    if (this.assist > 0 && spd > 3) {
      var slipAng = Math.atan2(this.wv, Math.max(uAbs, 2));
      var absSlip = Math.abs(slipAng);
      if (absSlip > 0.10) {
        var kick = U.clamp01((absSlip - 0.10) / 0.55);
        /* counter-yaw toward the steering direction, damped */
        var desiredYaw = (this.u / Math.max(this.wheelbase, 1)) * Math.tan(this.wheelSteer * 1.05);
        var corr = U.clamp((desiredYaw - this.yawRate), -1.6, 1.6);
        this.yawRate += corr * kick * this.assist * dt * 3.1;
        /* bleed lateral speed so the slide ends instead of spinning */
        this.wv -= this.wv * kick * this.assist * dt * 1.35;
        if (this.u > 1) this.u -= Math.abs(this.wv) * kick * this.assist * dt * 0.60;
      }
      /* mild self-aligning yaw damping at high speed */
      var stab = U.clamp01((spd - 12) / 40);
      this.yawRate -= this.yawRate * stab * (0.55 + 0.35 * (1 - this.isAI ? 0.0 : 0.2)) * dt;
    }

    /* ---- integrate local velocities ---- */
    var du = fxTotal / this.mass + this.yawRate * this.wv;
    var dw = (Fyf + Fyr) / this.mass - this.yawRate * this.u;
    this.u += du * dt;
    this.wv += dw * dt;

    /* aero-ish lateral bleed so the car does not slide forever */
    this.wv -= this.wv * dt * 0.35;

    /* rolling stop */
    if (Math.abs(this.u) < 0.25 && throttle < 0.05) this.u = 0;

    /* ---- yaw integration ---- */
    var yawAcc = (this.a * Fyf - this.b * Fyr) / this.Iz;
    this.yawRate += yawAcc * dt;
    this.yawRate = U.clamp(this.yawRate, -3.4, 3.4);
    this.heading = U.wrapAngle(this.heading + this.yawRate * dt);

    /* slip metrics */
    var slipSpeed = Math.abs(this.wv);
    this.slip = slipSpeed;
    this.driftAmount = U.clamp01((Math.abs(Math.atan2(this.wv, Math.max(uAbs, 1.5))) - 0.12) / 0.5);
    var wasDrifting = this.drifting;
    this.drifting = this.driftAmount > 0.22 && spd > 8;
    if (this.drifting) {
      this.driftTime += dt;
      this.driftScore += dt * spd * this.driftAmount * (this.nitroActive ? 1.5 : 1);
    } else {
      if (wasDrifting && this.driftTime > 0.6) this.driftScore += this.driftTime * 12;
      this.driftTime = 0;
    }

    /* ---- world movement ---- */
    var c = Math.cos(this.heading), s = Math.sin(this.heading);
    var vx = this.u * s + this.wv * c;
    var vz = this.u * c - this.wv * s;
    this.x += vx * dt;
    this.z += vz * dt;

    /* vertical: ground following, ramps, air */
    var groundY = tr.heightAt(this.proj.s) + Math.max(0, rampLift);
    this.rampCooldown = Math.max(0, (this.rampCooldown || 0) - dt);
    var jumped = false;
    if (this.y <= groundY + 0.06) {
      if (!this.onGround) { this.onGround = true; this.landingImpact = Math.abs(this.vy); }
      this.y = groundY;
      this.vy = Math.max(this.vy, 0);
      /* ramp launch: convert speed + ramp slope to vertical velocity */
      if (onRamp && onRamp.tt > 0.93 && spd > 14 && this.rampCooldown <= 0) {
        var launch = spd * (onRamp.R.height / onRamp.R.len) * 1.9 * onRamp.dir;
        if (launch > 3.2) {
          this.vy = Math.max(this.vy, launch);
          this.rampCooldown = 1.5;
          jumped = true;
          this.jumpFlash = 0.6;
        }
      }
      this.airborne = jumped;
      this.airTime = 0;
    } else {
      this.airborne = true;
      this.airTime += dt;
      this.vy -= G * dt * 0.92;
      this.y += this.vy * dt;
      /* gentle air control */
      this.heading = U.wrapAngle(this.heading + this.steer * dt * 0.55);
      if (this.y < groundY) { this.y = groundY; this.vy = 0; this.airborne = false; }
    }
    this.onGround = !this.airborne;

    /* ---- air/landing behaviour ---- */
    if (this.airborne) {
      /* no tyre forces in the air: damp lateral drifting slightly */
      this.wv -= this.wv * dt * 0.2;
    } else if (this.landingImpact > 2) {
      var li = U.clamp01(this.landingImpact / 14);
      this.u *= (1 - li * 0.16);
      this.yawRate += this.steer * li * 0.5;
      this.bounceCount++;
      this.landingImpact = 0;
    }

    /* ---- per-frame derived visuals ---- */
    var latAcc = (Fyf + Fyr) / this.mass;
    this.accelG = du;
    this.lateralG = latAcc;
    var targetRoll = U.clamp(-latAcc / G * 0.10, -0.16, 0.16) + this.wheelSteer * 0.0;
    this.rollAngle = U.damp(this.rollAngle, targetRoll, 9, dt);
    var targetPitch = U.clamp(-(engine / this.mass) / G * 0.03, -0.05, 0.05);
    if (this.airborne) targetPitch += U.clamp(-this.vy * 0.012, -0.12, 0.12);
    this.pitchAngle = U.damp(this.pitchAngle, targetPitch, 7, dt);
    this.wheelSpin += (this.u * dt) / 0.35;
    if (this.nitroActive && this.u < 14) this.wheelSpin += dt * 6;

    if (this.airborne) this.airTime += 0;
    return this;
  };

  /* resolve an impulse-ish collision between two vehicles */
  function collide(a, b, dt) {
    var dx = b.x - a.x, dz = b.z - a.z;
    var d2 = dx * dx + dz * dz;
    var minD = 2.35;
    if (d2 > minD * minD || d2 < 1e-6) return false;
    var d = Math.sqrt(d2);
    var nxp = dx / d, nzp = dz / d;
    var overlap = minD - d;
    var aMass = a.mass, bMass = b.mass;
    var tot = aMass + bMass;
    /* positional separation (heavier car pushes) */
    a.x -= nxp * overlap * (bMass / tot);
    a.z -= nzp * overlap * (bMass / tot);
    b.x += nxp * overlap * (aMass / tot);
    b.z += nzp * overlap * (aMass / tot);

    var av = a.worldVel({}), bv = b.worldVel({});
    var rvx = bv.x - av.x, rvz = bv.z - av.z;
    var vn = rvx * nxp + rvz * nzp;
    if (vn > 0) return false;
    var e = 0.35;
    var j = -(1 + e) * vn / (1 / aMass + 1 / bMass);
    var jx = j * nxp, jz = j * nzp;

    addWorldImpulse(a, -jx, -jz);
    addWorldImpulse(b, jx, jz);

    /* yaw kick: torque from the off-centre contact point */
    var offA = (dx * -nzp + dz * nxp);       // lateral offset of contact vs a's centre
    a.yawRate -= U.clamp(offA * j / (a.Iz * 3.2), -0.55, 0.55);
    b.yawRate += U.clamp(offA * j / (b.Iz * 3.2), -0.55, 0.55);
    a.hitCar = 0.4; b.hitCar = 0.4;
    return true;
  }

  function addWorldImpulse(car, ix, iz) {
    var c2 = Math.cos(car.heading), s2 = Math.sin(car.heading);
    var du = (ix * s2 + iz * c2) / car.mass;
    var dw = (ix * c2 - iz * s2) / car.mass;
    car.u += du;
    car.wv += dw;
  }

  NR.Vehicle = Vehicle;
  NR.collideVehicles = collide;
  NR.surfaceFor = surfaceFor;
  NR.PHYS = { G: G, OFFROAD: OFFROAD };
})();

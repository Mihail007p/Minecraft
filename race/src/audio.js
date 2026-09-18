/* NITRO RUSH — procedural audio (WebAudio, no asset files) */
(function () {
  'use strict';
  var NR = (window.NR = window.NR || {});
  var U = NR.U;

  var Audio = {
    ctx: null,
    ready: false,
    sfxOn: true,
    musicOn: true,
    master: null,
    engine: null,
    started: false
  };

  function noiseBuffer(ctx, seconds) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  Audio.init = function () {
    if (this.ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { this.ctx = new AC(); } catch (e) { return false; }
    var ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);
    this.noise = noiseBuffer(ctx, 2.0);
    this.ready = true;
    return true;
  };

  Audio.resume = function () {
    if (!this.ready && !this.init()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
  };

  Audio.setEnabled = function (sfx, music) {
    this.sfxOn = sfx !== false;
    this.musicOn = music !== false;
    if (this.master) this.master.gain.value = this.sfxOn || this.musicOn ? 0.9 : 0.0;
    if (this.musicOn) this.startMusic(); else this.stopMusic();
  };

  /* ---------------- engine ---------------- */
  Audio.startEngine = function (cfg) {
    if (!this.ready || !this.sfxOn) return;
    var ctx = this.ctx;
    if (this.engine) return;
    var g = ctx.createGain(); g.gain.value = 0.0;
    var filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 900;
    var o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 60;
    var o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 30;
    var o3 = ctx.createOscillator(); o3.type = 'sawtooth'; o3.frequency.value = 90; o3.detune.value = 12;
    var g2 = ctx.createGain(); g2.gain.value = 0.4;
    o1.connect(filt); o2.connect(g2); g2.connect(filt); o3.connect(filt);
    filt.connect(g); g.connect(this.master);
    o1.start(); o2.start(); o3.start();
    this.engine = { g: g, filt: filt, o1: o1, o2: o2, o3: o3, cfg: cfg || {} };
  };

  Audio.stopEngine = function () {
    if (!this.engine) return;
    try {
      this.engine.o1.stop(); this.engine.o2.stop(); this.engine.o3.stop();
    } catch (e) { }
    this.engine = null;
  };

  Audio.updateEngine = function (rpm, load, active) {
    if (!this.engine || !this.sfxOn) return;
    var e = this.engine;
    var base = (e.cfg.freq || 52) + rpm * (e.cfg.range || 120);
    e.o1.frequency.value = base;
    e.o2.frequency.value = base * 0.5;
    e.o3.frequency.value = base * 1.51;
    e.filt.frequency.value = 420 + rpm * 2200;
    var target = active ? (0.045 + 0.05 * load) : 0.012;
    e.g.gain.value += (target - e.g.gain.value) * 0.12;
  };

  /* ---------------- tyre screech ---------------- */
  Audio.startSkid = function () {
    if (!this.ready || !this.sfxOn || this.skid) return;
    var ctx = this.ctx;
    var src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 6;
    var g = ctx.createGain(); g.gain.value = 0;
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start();
    this.skid = { src: src, g: g, bp: bp };
  };

  Audio.updateSkid = function (amount) {
    if (!this.sfxOn) return;
    if (amount > 0.05 && !this.skid) this.startSkid();
    if (!this.skid) return;
    var target = Math.min(0.16, amount * 0.16);
    this.skid.g.gain.value += (target - this.skid.g.gain.value) * 0.2;
  };

  /* ---------------- one-shots ---------------- */
  Audio.blip = function (freq, dur, type, vol) {
    if (!this.ready || !this.sfxOn) return;
    var ctx = this.ctx, t = ctx.currentTime;
    var o = ctx.createOscillator(); o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol == null ? 0.15 : vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + (dur || 0.12));
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + (dur || 0.12) + 0.02);
  };

  Audio.crash = function (strength) {
    if (!this.ready || !this.sfxOn) return;
    var ctx = this.ctx, t = ctx.currentTime;
    var src = ctx.createBufferSource(); src.buffer = this.noise;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.28);
    var g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.4, 0.12 + strength * 0.3), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.32);
  };

  Audio.nitroWhoosh = function () {
    if (!this.ready || !this.sfxOn) return;
    var ctx = this.ctx, t = ctx.currentTime;
    var src = ctx.createBufferSource(); src.buffer = this.noise;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(4200, t + 0.5);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.58);
    this.blip(880, 0.25, 'sine', 0.06);
  };

  Audio.chime = function (kind) {
    var notes = kind === 'win' ? [523, 659, 784, 1046] : (kind === 'lose' ? [392, 330, 262] : [660, 880]);
    if (!this.ready || !this.sfxOn) return;
    for (var i = 0; i < notes.length; i++) {
      (function (self, n, delay) {
        setTimeout(function () { self.blip(n, 0.22, 'triangle', 0.12); }, delay);
      })(this, notes[i], i * 95);
    }
  };

  Audio.countdownBeep = function (final) {
    this.blip(final ? 1180 : 660, final ? 0.5 : 0.2, 'square', final ? 0.2 : 0.14);
  };

  /* ---------------- procedural music ---------------- */
  var SCALE = [0, 3, 5, 7, 10, 12, 15, 14];
  Audio.startMusic = function () {
    if (!this.ready || !this.musicOn || this.music) return;
    var ctx = this.ctx;
    var master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(this.master);
    master.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 1.5);
    this.music = { master: master, next: ctx.currentTime + 0.1, step: 0, timer: null };
    var self = this;
    this.music.timer = setInterval(function () { self.scheduleMusic(); }, 120);
  };

  Audio.stopMusic = function () {
    if (!this.music) return;
    clearInterval(this.music.timer);
    try { this.music.master.disconnect(); } catch (e) { }
    this.music = null;
  };

  Audio.scheduleMusic = function () {
    if (!this.music || !this.ready) return;
    var ctx = this.ctx, m = this.music;
    var beat = 60 / 128 / 2;                    // 8th notes
    while (m.next < ctx.currentTime + 0.4) {
      var s = m.step;
      var root = 55 * Math.pow(2, (s % 16 < 8 ? 0 : 3) / 12);
      /* bass */
      if (s % 2 === 0) musicNote(ctx, m.master, root, m.next, beat * 1.6, 'sawtooth', 0.5, 420);
      /* arpeggio */
      var n = SCALE[(s * 3) % SCALE.length];
      musicNote(ctx, m.master, root * 4 * Math.pow(2, n / 12), m.next, beat * 0.9, 'square', 0.14, 3200);
      /* hats */
      if (s % 2 === 1) {
        var src = ctx.createBufferSource(); src.buffer = this.noise;
        var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6500;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.06, m.next);
        g.gain.exponentialRampToValueAtTime(0.001, m.next + 0.06);
        src.connect(hp); hp.connect(g); g.connect(m.master);
        src.start(m.next); src.stop(m.next + 0.08);
      }
      /* kick every beat */
      if (s % 4 === 0) {
        var o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(120, m.next);
        o.frequency.exponentialRampToValueAtTime(45, m.next + 0.12);
        var kg = ctx.createGain();
        kg.gain.setValueAtTime(0.4, m.next);
        kg.gain.exponentialRampToValueAtTime(0.001, m.next + 0.2);
        o.connect(kg); kg.connect(m.master);
        o.start(m.next); o.stop(m.next + 0.22);
      }
      m.next += beat;
      m.step++;
    }
  };

  function musicNote(ctx, dest, freq, time, dur, type, vol, lp) {
    var o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp || 2000;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    o.connect(f); f.connect(g); g.connect(dest);
    o.start(time); o.stop(time + dur + 0.02);
  }

  NR.Audio = Audio;
})();

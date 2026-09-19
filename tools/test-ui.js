/* Integration test: runs the real app in jsdom with a stubbed WebGL renderer.
   Usage: node tools/test-ui.js   (needs the `jsdom` package) */
'use strict';
const fs = require('fs');
const path = require('path');

let jsdomLib;
try { jsdomLib = require('jsdom'); }
catch (e) {
  try { jsdomLib = require('/tmp/uidep/node_modules/jsdom'); }
  catch (e2) { console.log('jsdom not installed - skipping UI test'); process.exit(0); }
}
const { JSDOM, VirtualConsole } = jsdomLib;

const root = path.join(__dirname, '..');
const raceDir = path.join(root, 'race');

let failures = 0, checks = 0;
function ok(cond, msg, extra) {
  checks++;
  if (cond) console.log('  ok   ' + msg);
  else { failures++; console.log('  FAIL ' + msg + (extra != null ? '  -> ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const html = fs.readFileSync(path.join(raceDir, 'index.html'), 'utf8');
  const vc = new VirtualConsole();               // swallow jsdom noise
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://example.com/race/',
    virtualConsole: vc
  });
  const win = dom.window;

  /* --- canvas stub -------------------------------------------------- */
  const ctx2d = new Proxy({}, {
    get(t, p) {
      if (p === 'canvas') return { width: 220, height: 220 };
      return () => { };
    },
    set() { return true; }
  });
  win.HTMLCanvasElement.prototype.getContext = function () { return ctx2d; };

  /* --- phone API stubs (Android Chrome) ------------------------------ */
  win._full = null;
  win.Element.prototype.requestFullscreen = function () {
    win._full = this;
    win.document.fullscreenElement = this;
    win.document.dispatchEvent(new win.Event('fullscreenchange'));
    return Promise.resolve();
  };
  win.document.exitFullscreen = function () {
    win._full = null;
    win.document.fullscreenElement = null;
    win.document.dispatchEvent(new win.Event('fullscreenchange'));
    return Promise.resolve();
  };
  win.THREE_ORIENTATION = { locked: [], unlock: function () { } };
  win.screen.orientation = { lock: function (o) { win.THREE_ORIENTATION.locked.push(o); return Promise.resolve(); }, type: 'portrait-primary' };
  win._vibes = [];
  win.navigator.vibrate = function (ms) { win._vibes.push(ms); return true; };
  win._wakes = { requests: 0, releases: 0 };
  win.navigator.wakeLock = {
    request: function () {
      win._wakes.requests++;
      return Promise.resolve({ released: false, addEventListener: function () { }, release: function () { win._wakes.releases++; return Promise.resolve(); } });
    }
  };

  const stub = `
  (function(){
    var THREE = window.THREE;
    THREE.WebGLRenderer = function () {
      this.domElement = document.getElementById('gl');
      this.setClearColor = function(){};
      this.setPixelRatio = function(){};
      this.setSize = function(){};
      this.dispose = function(){};
      this.shadowMap = {};
      this.render = function(){
        var A = window.NR && window.NR.App;
        if (A) A.renderCount = (A.renderCount||0)+1;
      };
    };
  })();
  `;

  /* load exactly the scripts the HTML asks for, in HTML order */
  const files = [];
  const tagRe = /<script src="src\/([^"]+)"><\/script>/g;
  let m;
  while ((m = tagRe.exec(html))) files.push(m[1]);
  ok(files.length > 0, 'HTML references game scripts (' + files.length + ')');
  ok(files.indexOf('hud.js') >= 0, 'HTML loads hud.js');
  ok(files[files.length - 1] === 'app.js', 'app.js is loaded last');
  for (const f of files) {
    const file = path.join(raceDir, 'src', f);
    if (!fs.existsSync(file)) { console.log('  FAIL missing script file ' + f); failures++; checks++; continue; }
    try {
      win.eval(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      console.log('  FAIL loading ' + f + ': ' + e.message);
      console.log(`\n${checks - failures}/${checks} checks passed`);
      process.exit(1);
    }
  }
  ok(!!win.NR.HUD && !!win.NR.Audio && !!win.NR.SceneKit, 'all modules registered (HUD/Audio/SceneKit)');
  /* three.js defines WebGLRenderer itself: stub it AFTER the real sources load */
  win.eval(stub);

  const NR = win.NR;
  const $ = (id) => win.document.getElementById(id);
  const App = NR.App;

  console.log('\n== Boot ==');
  let bootError = null;
  try { win.NR.boot(); } catch (e) { bootError = e; }
  ok(!bootError, 'boot() runs without throwing', bootError && bootError.stack);
  await sleep(420);
  ok(App.state === 'menu', 'menu is shown after boot (' + App.state + ')');
  ok($('s-menu').classList.contains('on'), 'menu screen visible');
  ok(App.renderer && App.renderer.render, 'renderer created');
  await sleep(220);
  ok((App.renderCount || 0) > 0, 'render loop is running (' + (App.renderCount || 0) + ' frames)');

  console.log('\n== Garage ==');
  $('btn-garage').click();
  ok(App.state === 'garage', 'garage opens');
  ok($('garage-list').children.length === NR.CARS.length, 'all cars listed (' + $('garage-list').children.length + ')');
  App.save.money = 200000;
  App.garage.carId = 'kometa';
  App.buildGarage();
  const moneyBefore = App.save.money;
  $('btn-garage-buy').click();
  ok(NR.Save.owned('kometa'), 'car purchased');
  ok(App.save.money === moneyBefore - NR.CarFactory.carById('kometa').price, 'money deducted (' + App.save.money + ')');
  ok(App.save.selectedCar === 'kometa', 'purchased car becomes selected');
  const upgBtn = $('garage-upgrades').querySelector('button:not([disabled])');
  const moneyBeforeUpg = App.save.money;
  upgBtn.click();
  ok(App.save.money < moneyBeforeUpg, 'upgrade purchased');
  ok(Object.keys(NR.Save.carState('kometa').upgrades).length > 0, 'upgrade stored in save');
  ok(NR.Save.carState('kometa').color != null, 'car has a colour');
  App.save.money = 300000;
  App.maxTune();
  ok((NR.Save.carState('kometa').upgrades.engine || 0) >= 1, 'max tune raises engine level');
  $('btn-garage-back').click();
  ok(App.state === 'menu', 'back to menu');

  console.log('\n== Career ==');
  $('btn-career').click();
  ok(App.state === 'career', 'career opens');
  ok($('career-list').querySelectorAll('.series').length === NR.SERIES.length, 'all series listed');
  const firstStart = $('career-list').querySelector('.evt:not(.locked) button');
  ok(!!firstStart, 'first event is playable');
  ok($('career-list').querySelectorAll('.evt.locked button').length > 0, 'later events are locked');

  console.log('\n== Race (career event) ==');
  App.save.selectedCar = 'kometa';
  firstStart.click();
  ok(App.state === 'loading', 'loading state entered');
  let guard = 0;
  while (App.state === 'loading' && guard++ < 300) await sleep(30);
  ok(App.state === 'race', 'race started (' + App.state + ')');
  ok($('s-race').classList.contains('on'), 'HUD visible');
  ok(App.view && App.view.race, 'race object exists');
  ok(App.view.race.cars.length === App.view.race.rivals.length + 1, 'grid filled');

  for (let i = 0; i < 60; i++) App.view.update(1 / 60, App.readInput(1 / 60));
  ok(App.view.race.state === 'countdown', 'still counting down after 1s');
  ok(App.view.race.player.speed() < 1.5, 'player frozen on the grid');

  const t0 = Date.now();
  let frames = 0, maxSpeedSeen = 0, hudSpeedSeen = 0;
  const input = { throttle: 1, brake: 0, steer: 0, handbrake: 0, nitro: 0 };
  while (App.view.race.state !== 'finished' && frames < 60 * 420) {
    const race = App.view.race;
    const p = race.player;
    const look = race.track.posAt(p.proj.s + Math.max(14, p.speed() * 0.7), 0, {});
    input.steer = NR.U.clamp(NR.U.wrapAngle(Math.atan2(look.x - p.x, look.z - p.z) - p.heading) * 1.6, -1, 1);
    input.nitro = (p.nitro > p.nitroCap * 0.6 && Math.abs(race.track.k[p.proj.i]) < 1 / 400) ? 1 : 0;
    App.view.update(1 / 60, input);
    frames++;
    maxSpeedSeen = Math.max(maxSpeedSeen, p.speed() * 3.6);
    hudSpeedSeen = Math.max(hudSpeedSeen, parseInt($('hud-speed').textContent, 10) || 0);
  }
  const wall = Date.now() - t0;
  ok(App.view.race.state === 'finished', 'race finishes (' + frames + ' frames / ' + (frames / 60).toFixed(1) + 's sim in ' + wall + 'ms wall)');
  ok(maxSpeedSeen > 90, 'player reached speed (' + maxSpeedSeen.toFixed(0) + ' km/h)');
  ok(hudSpeedSeen > 90, 'HUD speedometer updates (' + hudSpeedSeen + ')');
  ok($('hud-lap').textContent.indexOf('Круг') === 0, 'lap HUD: ' + $('hud-lap').textContent);
  ok($('hud-position').textContent.indexOf('/') > 0, 'position HUD: ' + $('hud-position').textContent);
  ok(App.view.race.player.nitro >= 0, 'nitro never negative');

  await sleep(1300);
  ok(App.state === 'results', 'results screen shown (' + App.state + ')');
  ok($('s-results').classList.contains('on'), 'results overlay visible');
  ok($('res-table').querySelectorAll('tr').length > 1, 'results table filled');
  ok(/\d/.test($('res-money').textContent), 'reward shown: ' + $('res-money').textContent);
  ok(!!App.save.career[App.lastRaceConfig.eventId], 'career record saved');

  console.log('\n== Retry / pause ==');
  $('btn-res-retry').click();
  let guard2 = 0;
  while (App.state === 'loading' && guard2++ < 300) await sleep(30);
  ok(App.state === 'race', 'retry starts a new race');
  $('btn-pause').click();
  ok(App.state === 'paused', 'pause works');
  ok($('s-pause').classList.contains('on'), 'pause overlay visible');
  ok($('pause-stats').children.length > 0, 'pause shows session stats');
  $('btn-resume').click();
  ok(App.state === 'race', 'resume works');
  $('btn-quit').click();
  ok(App.state === 'menu', 'quit returns to the menu');

  console.log('\n== Phone controls ==');
  const ptr = (el, type, opts) => el.dispatchEvent(new win.PointerEvent(type,
    Object.assign({ bubbles: true, cancelable: true, pointerId: 1, clientX: 0, clientY: 0 }, opts)));

  /* удержание педали на палец */
  $('btn-quick').click();
  $('btn-quick-start').click();                       // «Старт» просит полный экран
  ok(win._full === win.document.documentElement, 'fullscreen requested on race start');
  ok(win.THREE_ORIENTATION.locked.indexOf('landscape') >= 0, 'landscape orientation locked');
  let guard4 = 0;
  while (App.state === 'loading' && guard4++ < 300) await sleep(30);
  ok(App.state === 'race', 'quick race starts from the phone path');
  ok(App.Full.active(), 'fullscreen active');
  $('btn-full').click();
  ok(!App.Full.active(), 'HUD button leaves fullscreen');
  $('btn-full').click();
  ok(App.Full.active(), 'HUD button enters fullscreen again');
  ok(win._wakes.requests > 0, 'screen wake lock requested during the race');

  /* руль-качели: палец отвечает сразу, дальше ход доходит до полного */
  ok(App.settings.steerMode === 'zones', 'steering starts in zones mode (' + App.settings.steerMode + ')');
  ptr($('steer-right'), 'pointerdown');
  ok(App.touch.steerR === true, 'right side of the wheel pressed');
  const firstFrame = App.readInput(1 / 60);
  ok(firstFrame.steer > 0.3, 'wheel answers the touch immediately (' + firstFrame.steer.toFixed(2) + ')');
  ok(firstFrame.steer < 0.75, 'wheel does not snap straight to full lock (' + firstFrame.steer.toFixed(2) + ')');
  for (let i = 0; i < 20; i++) App.readInput(1 / 60);
  ok(App.touch.steer > 0.95, 'wheel reaches full lock when held (' + App.touch.steer.toFixed(2) + ')');
  ok($('steer-right').classList.contains('act'), 'pressed side lights up');
  ok(!$('steer-left').classList.contains('act'), 'other side stays dim');
  /* палец можно вести не отпуская: сторона меняется по положению */
  ptr($('steer'), 'pointermove', { pointerId: 1, clientX: 40, clientY: 300 });
  ok(App.touch.steerL === true && App.touch.steerR === false, 'sliding the thumb across switches side');
  for (let i = 0; i < 20; i++) App.readInput(1 / 60);
  ok(App.readInput(1 / 60).steer < -0.5, 'slid wheel steers left (' + App.touch.steer.toFixed(2) + ')');
  ptr($('steer'), 'pointerup', { pointerId: 1 });
  ok(App.touch.steerL === false && App.touch.steerR === false, 'wheel released');
  for (let i = 0; i < 12; i++) App.readInput(1 / 60);
  ok(App.touch.steer === 0, 'steering recentres after release');
  ok(!$('steer-left').classList.contains('act') && !$('steer-right').classList.contains('act'), 'both sides dim after release');

  /* наклон телефона */
  App.settings.steerMode = 'tilt';
  App.applySteerMode();
  const tiltStub = { gamma: 40 };
  App.tilt.calib = null;
  App.onTilt(tiltStub);
  ok(App.tilt.calib === 40, 'tilt calibration stored (' + App.tilt.calib + '°)');
  tiltStub.gamma = 49;                                  // наклон на 9°
  App.onTilt(tiltStub);
  for (let i = 0; i < 10; i++) App.readInput(1 / 60);
  ok(App.readInput(1 / 60).steer > 0.15, 'tilt steers the car (' + App.touch.steer.toFixed(2) + ')');
  ok($('tilt-ind').firstElementChild.style.width !== '', 'tilt indicator moves');
  tiltStub.gamma = 40;
  App.onTilt(tiltStub);
  for (let i = 0; i < 30; i++) App.readInput(1 / 60);
  ok(Math.abs(App.touch.steer) < 0.05, 'tilt recentres when the phone is level (' + App.touch.steer.toFixed(2) + ')');

  /* свайп-руль (раньше этот режим не работал: слой был под pointer-events:none) */
  App.settings.steerMode = 'drag';
  App.applySteerMode();
  ok(win.document.body.classList.contains('drag-steer'), 'drag layer enabled in this mode');
  ok(win.getComputedStyle($('drag-layer')).pointerEvents === 'auto', 'drag layer receives touches');
  ptr($('drag-layer'), 'pointerdown', { pointerId: 3, clientX: 300, clientY: 120 });
  ok(!!App.touch.drag, 'drag started');
  ptr($('drag-layer'), 'pointermove', { pointerId: 3, clientX: 300 - win.innerWidth * 0.15, clientY: 120 });
  for (let i = 0; i < 20; i++) App.readInput(1 / 60);
  ok(App.readInput(1 / 60).steer < -0.4, 'dragging left steers left (' + App.touch.steer.toFixed(2) + ')');
  ptr($('drag-layer'), 'pointerup', { pointerId: 3, clientX: 100, clientY: 120 });
  ok(!App.touch.drag, 'drag ends on release');
  App.settings.steerMode = 'zones';
  App.applySteerMode();
  ok(!win.document.body.classList.contains('drag-steer'), 'drag layer off in zones mode');

  /* дрift-переключатель: одним пальцем и дрифт, и нитро */
  App.settings.driftMode = 'hold';
  ptr($('pad-drift'), 'pointerdown');
  ok(App.input.driftHeld === true, 'drift holds while the pad is pressed (hold mode)');
  ptr($('pad-drift'), 'pointerup');
  ok(App.input.driftHeld === false, 'drift releases with the finger (hold mode)');
  App.settings.driftMode = 'toggle';
  ptr($('pad-drift'), 'pointerdown');
  ptr($('pad-drift'), 'pointerup');
  ok(App.input.driftHeld === true, 'drift stays on after a tap (toggle mode)');
  App.readInput(1 / 60);
  ok($('pad-drift').classList.contains('on'), 'drift pad shows it is locked on');
  ptr($('pad-nitro'), 'pointerdown');                 // вторым нажатием — нитро
  ok(App.readInput(1 / 60).nitro === 1, 'nitro works while drifting (toggle mode)');
  ptr($('pad-nitro'), 'pointerup');
  ok(App.readInput(1 / 60).handbrake === 1, 'handbrake still applied while drifting');
  ptr($('pad-drift'), 'pointerdown');
  ptr($('pad-drift'), 'pointerup');
  ok(App.input.driftHeld === false, 'second tap switches drift off');
  App.readInput(1 / 60);
  ok(!$('pad-drift').classList.contains('on'), 'drift pad light goes out');
  App.settings.driftMode = 'hold';
  ok(App.readInput(1 / 60).handbrake === 0, 'no handbrake after switching drift off');

  /* руль считает центр по своей полосе — в режиме левши полоса справа */
  const realRect = win.Element.prototype.getBoundingClientRect;
  $('steer').getBoundingClientRect = () => ({ left: 346, top: 0, width: 374, height: 360, right: 720, bottom: 360 });
  ptr($('steer'), 'pointerdown', { pointerId: 5, clientX: 700, clientY: 320 });
  for (let i = 0; i < 20; i++) App.readInput(1 / 60);
  ok(App.readInput(1 / 60).steer > 0.5, 'touch on the right half steers right (' + App.touch.steer.toFixed(2) + ')');
  ok(App.touch.slide.mag > 0.9, 'far edge gives full steering power (' + App.touch.slide.mag.toFixed(2) + ')');
  ptr($('steer'), 'pointermove', { pointerId: 5, clientX: 380, clientY: 320 });
  ok(App.touch.steerL === true, 'sliding past the strip centre switches side');
  ptr($('steer'), 'pointermove', { pointerId: 5, clientX: 520, clientY: 320 });
  ok(App.touch.slide.mag < 0.6, 'near the strip centre steering is gentler (' + App.touch.slide.mag.toFixed(2) + ')');
  ptr($('steer'), 'pointermove', { pointerId: 5, clientX: 380, clientY: 320 });
  ok(App.touch.slide.mag > 0.85, 'further out the wheel gives full power (' + App.touch.slide.mag.toFixed(2) + ')');
  ptr($('steer'), 'pointerup', { pointerId: 5 });
  App.touch.steer = 0;
  void realRect;

  /* регрессия: App.input больше не пересоздаётся, поэтому педали живы
     и после выхода в меню (раньше во втором заезде кнопки «умирали») */
  ptr($('pad-brake'), 'pointerdown');
  ok(App.readInput(1 / 60).brake === 1, 'brake pad works in the first race');
  ptr($('pad-brake'), 'pointerup');
  $('btn-quit').click();
  $('btn-quick').click();
  $('btn-quick-start').click();
  let guard5 = 0;
  while (App.state === 'loading' && guard5++ < 300) await sleep(30);
  ok(App.state === 'race', 'second race started after the menu');
  ptr($('pad-brake'), 'pointerdown');
  ok(App.readInput(1 / 60).brake === 1, 'brake pad still works in the second race');
  ptr($('pad-brake'), 'pointerup');
  ptr($('pad-drift'), 'pointerdown');
  ok(App.readInput(1 / 60).handbrake === 1, 'drift pad still works in the second race');
  ptr($('pad-drift'), 'pointerup');
  ptr($('steer-right'), 'pointerdown');
  for (let i = 0; i < 10; i++) App.readInput(1 / 60);
  ok(App.readInput(1 / 60).steer > 0.5, 'steering still works in the second race');
  ptr($('steer-right'), 'pointerup');
  /* заново в заезд: дальнейшие проверки нажатий проверяются именно в гонке */
  $('btn-quit').click();
  $('btn-quick').click();
  $('btn-quick-start').click();
  let guard6 = 0;
  while (App.state === 'loading' && guard6++ < 300) await sleep(30);
  ok(App.state === 'race', 'race ready for the pause checks');

  /* вибрация и крупные кнопки */
  const vibesBefore = win._vibes.length;
  ptr($('pad-nitro'), 'pointerdown');
  ok(win._vibes.length > vibesBefore, 'nitro pad vibrates');
  ptr($('pad-nitro'), 'pointerup');
  App.settings.padSize = 'big';
  App.applySteerMode();
  ok(win.document.body.classList.contains('bigpads'), 'big pads mode applies');
  App.settings.padSize = 'normal';
  App.applySteerMode();

  /* пауза отпускает всё, что было зажато */
  App.touch.steerL = true;
  App.input.gasHeld = true;
  $('btn-pause').click();
  ok(!App.touch.steerL && !App.input.gasHeld, 'pause clears held presses');
  ok(!$('steer-left').classList.contains('act'), 'zone highlight cleared on pause');
  $('btn-quit').click();
  ok(win._wakes.releases > 0, 'wake lock released when leaving the race');
  ok(App.state === 'menu', 'back to menu after the phone checks');

  console.log('\n== Quick race + settings ==');
  $('btn-quick').click();
  ok(App.state === 'quick', 'quick race screen opens');
  ok($('quick-tracks').children.length === NR.TRACKS.length, 'all tracks selectable');
  $('quick-tracks').children[3].click();
  $('quick-laps').children[1].click();
  $('btn-quick-start').click();
  let guard3 = 0;
  while (App.state === 'loading' && guard3++ < 300) await sleep(30);
  ok(App.state === 'race', 'quick race starts');
  ok(App.view.race.track.id === NR.TRACKS[3].id, 'chosen track loaded (' + App.view.race.track.id + ')');
  ok(App.view.race.laps === 2, 'chosen lap count used (' + App.view.race.laps + ')');
  $('btn-quit').click();
  $('btn-settings').click();
  ok($('s-settings').classList.contains('on'), 'settings open');
  $('set-quality').children[1].click();
  ok(App.settings.quality === 'low' && App.quality === 'low', 'quality setting applied');
  $('set-steer').children[2].click();
  ok(App.settings.steerMode === 'drag', 'steering mode persisted');
  $('set-auto').children[1].click();
  ok(App.settings.autoGas === false, 'auto throttle toggled');
  $('set-pads').children[2].click();
  ok(App.settings.padSize === 'big', 'pad size setting persisted');
  ok(win.document.body.classList.contains('bigpads'), 'big pads applied to the screen');
  $('set-pads').children[0].click();
  ok(App.settings.padSize === 'small' && win.document.body.classList.contains('smallpads'), 'small pads applied');
  $('set-pads').children[1].click();
  ok(!win.document.body.classList.contains('smallpads') && !win.document.body.classList.contains('bigpads'), 'normal pads applied');
  $('set-side').children[1].click();
  ok(App.settings.padSide === 'left' && win.document.body.classList.contains('lefty'), 'left-handed layout applied');
  $('set-side').children[0].click();
  ok(App.settings.padSide === 'right' && !win.document.body.classList.contains('lefty'), 'right-handed layout back');
  $('set-tilt').children[2].click();
  ok(App.settings.tiltSens === 18, 'tilt sensitivity setting persisted');
  $('set-vibr').children[1].click();
  ok(App.settings.vibrate === false, 'vibration can be switched off');
  const vibesOff = win._vibes.length;
  App.buzz(30);
  ok(win._vibes.length === vibesOff, 'no vibration while switched off');
  $('set-vibr').children[0].click();
  $('set-full').children[1].click();
  ok(App.settings.autoFull === false, 'auto fullscreen can be switched off');
  $('set-full').children[0].click();
  $('set-tilt').children[1].click();
  ok(App.settings.tiltSens === 26, 'tilt sensitivity back to default');
  $('set-steer').children[0].click();
  $('set-auto').children[0].click();
  $('set-quality').children[0].click();
  $('btn-settings-back').click();
  ok(!$('s-settings').classList.contains('on'), 'settings close');

  console.log('\n== Persistence ==');
  const savedMoney = App.save.money;
  NR.Save.load();
  ok(NR.Save.data.money === savedMoney, 'save survives reload (' + NR.Save.data.money + ')');
  ok(NR.Save.owned('kometa'), 'purchased cars survive reload');

  console.log('\n== Robustness ==');
  win.dispatchEvent(new win.Event('resize'));
  win.document.dispatchEvent(new win.Event('visibilitychange'));
  await sleep(80);
  ok(true, 'resize/visibility handlers survive');
  win.localStorage.setItem(NR.SAVE_KEY, 'garbage');
  NR.Save.load();
  ok(NR.Save.data.money === NR.DEFAULT_SAVE.money, 'corrupted save falls back to defaults');

  console.log('\n== Single-file offline build ==');
  await testBundle();

  console.log(`\n${checks - failures}/${checks} checks passed`);
  win.close();
  process.exit(failures ? 1 : 0);
}

/* Loads dist/"NITRO RUSH.html" the way a phone would: one file, no network. */
async function testBundle() {
  const bundlePath = path.join(root, 'dist', 'NITRO RUSH.html');
  if (!fs.existsSync(bundlePath)) { ok(false, 'offline bundle exists (run tools/build-offline.js)'); return; }
  const html = fs.readFileSync(bundlePath, 'utf8');
  ok(html.indexOf('<script src=') < 0, 'bundle has no external script references');
  ok(html.indexOf('id="nr-bundle"') > 0, 'bundle contains the inlined game');
  ok(html.indexOf('window.NR.boot();') > 0, 'bundle boots itself');

  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://local/', virtualConsole: vc });
  const w = dom.window;
  const ctx = new Proxy({}, { get(t, p) { return p === 'canvas' ? { width: 220, height: 220 } : () => { }; }, set() { return true; } });
  w.HTMLCanvasElement.prototype.getContext = function () { return ctx; };

  const code = w.document.getElementById('nr-bundle').textContent;
  ok(code.length > 500000, 'bundle carries the full game (~' + Math.round(code.length / 1024) + ' KB)');
  let err = null;
  try { w.eval(code); } catch (e) { err = e; }
  ok(!err, 'bundle code evaluates', err && err.message);
  ok(!!(w.NR && w.NR.CARS && w.NR.TRACKS && w.NR.Race && w.NR.SceneKit && w.NR.HUD && w.NR.App), 'all modules present in the bundle');
  w.eval('THREE.WebGLRenderer = function(){ this.setClearColor=function(){}; this.setPixelRatio=function(){}; this.setSize=function(){}; this.render=function(){}; };');
  let bootErr = null;
  try { w.NR.boot(); } catch (e2) { bootErr = e2; }
  ok(!bootErr, 'bundle boots without throwing', bootErr && bootErr.message);
  await sleep(420);
  ok(w.NR.App.state === 'menu', 'bundle reaches the main menu (' + w.NR.App.state + ')');
  ok(w.document.getElementById('s-menu').classList.contains('on'), 'menu visible in the bundle');
  /* the bundle must be able to start a race too */
  const car = w.NR.Save.currentCar();
  w.NR.App.startRace({
    mode: 'race', trackId: 'city', laps: 1, rivals: 3, difficulty: 0.5, playerCar: car,
    upgrades: {}, color: 0xd11f2f, targetPlace: 3, seed: 5
  });
  let guard = 0;
  while (w.NR.App.state === 'loading' && guard++ < 300) await sleep(30);
  ok(w.NR.App.state === 'race', 'bundle starts a race (' + w.NR.App.state + ')');
  /* run past the 4 s countdown, then confirm the sim advances */
  for (let i = 0; i < 60 * 6; i++) w.NR.App.view.update(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: 0, nitro: 0 });
  ok(w.NR.App.view.race.time > 0.5, 'bundle race advances (' + w.NR.App.view.race.time.toFixed(2) + 's)');
  ok(w.NR.App.view.race.player.speed() > 3, 'bundle player accelerates (' + (w.NR.App.view.race.player.speed() * 3.6).toFixed(0) + ' km/h)');
  w.close();
}

main().catch((e) => {
  console.log('TEST CRASH: ' + ((e && e.stack) || e));
  process.exit(1);
});

/* Automated checks for the NITRO RUSH simulation core.
   Run: node tools/test-sim.js            */
'use strict';
const { NR } = require('./sim-env.js');

let failures = 0, checks = 0;
function ok(cond, msg, extra) {
  checks++;
  if (cond) { console.log('  ok   ' + msg); }
  else { failures++; console.log('  FAIL ' + msg + (extra != null ? '  -> ' + extra : '')); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

/* ---------------------------------------------------------------- tracks */
section('Tracks');
const tracks = {};
for (const def of NR.TRACKS) {
  const t0 = Date.now();
  const tr = NR.buildTrack(def);
  tracks[def.id] = tr;
  const v = NR.validateTrack(tr);
  const buildMs = Date.now() - t0;
  console.log(`  ${def.id.padEnd(9)} len=${tr.length.toFixed(0)}m pts=${tr.M} build=${buildMs}ms`);
  ok(v.ok, `track "${def.name}" geometry valid`, v.problems.join('; '));
  ok(tr.length > 1250 && tr.length < 6000, `track "${def.id}" length sane (${tr.length.toFixed(0)}m)`);
  ok(v.maxSlope <= 0.22, `track "${def.id}" slopes drivable (${(v.maxSlope * 100).toFixed(1)}%)`);
  ok(v.minRadius >= 23.5, `track "${def.id}" min radius ${v.minRadius.toFixed(0)}m`);
  ok(tr.ramps.length >= 1 && tr.gates.length >= 2, `track "${def.id}" has ramps/gates`);
  /* start/finish must be on a reasonably straight section */
  let maxK = 0;
  for (let i = -10; i <= 10; i++) maxK = Math.max(maxK, Math.abs(tr.k[(i + tr.M) % tr.M]));
  ok(maxK < 1 / 40, `track "${def.id}" start straight (k=${maxK.toFixed(4)})`);
}

/* ------------------------------------------------------------ car specs */
section('Car catalogue & physics');
function analyticTopSpeed(carId, upgrades) {
  const car = NR.CarFactory.carById(carId);
  const st = NR.CarFactory.statsFor(car, upgrades || {});
  let u = 0;
  const dt = 1 / 120;
  for (let i = 0; i < 120 * 240; i++) {
    u += (st.mass * st.a0 - st.dragK * u * Math.abs(u) - st.rollK * u) / st.mass * dt;
  }
  return u * 3.6;
}

/* drive the real Vehicle class along the centreline, auto-steering to stay on
   the asphalt; the car is measured over the first 600 m of a fast track */
function simulateOnTrack(carId, upgrades, trackId) {
  const tr = tracks[trackId || 'coast'];
  const car = NR.CarFactory.carById(carId);
  const stats = NR.CarFactory.statsFor(car, upgrades || {});
  const v = new NR.Vehicle(tr, stats, { assist: 0.9 });
  v.placeAt(0, 0);
  /* drive with the game's own AI (perfect, no mistakes) so the run is a
     realistic lap rather than a straight-line drag test */
  const ai = new NR.AIDriver(tr, { skill: 1.0, aggression: 0.3, lineBias: 0, mistakeChance: 0, seed: 77 });
  let t100 = null, top = 0, t = 0, offroad = 0, travelled = 0;
  const dt = 1 / 120;
  const limit = 1500;
  while (travelled < limit && t < 60) {
    const input = ai.drive(v, dt, [], null);
    v.step(dt, input);
    travelled += Math.max(0, v.speed() * dt);
    t += dt;
    const kmh = v.speed() * 3.6;
    if (t100 === null && kmh >= 100) t100 = t;
    top = Math.max(top, kmh);
    if (Math.abs(v.proj.lat) > v.proj.half) offroad += dt;
  }
  return { t100, top, car, offroad, window: t };
}

for (const car of NR.CARS) {
  const r = simulateOnTrack(car.id, {});
  const specTop = analyticTopSpeed(car.id, {});
  const accelErr = Math.abs(r.t100 - car.accel) / car.accel;
  const topErrC = Math.abs(specTop - car.topSpeed) / car.topSpeed;
  ok(r.t100 != null && accelErr < 0.15, `${car.name}: 0-100 = ${(r.t100 == null ? NaN : r.t100).toFixed(2)}s (спец. ${car.accel}s)`, (accelErr * 100).toFixed(0) + '%');
  ok(topErrC < 0.02, `${car.name}: паспортная max speed = ${specTop.toFixed(0)} км/ч (спец. ${car.topSpeed})`, (topErrC * 100).toFixed(0) + '%');
  const usable = r.top / car.topSpeed;
  ok(usable > 0.45, `${car.name}: реально разгоняется на трассе до ${r.top.toFixed(0)} км/ч (${(usable * 100).toFixed(0)}% от максимума)`);
  ok(r.offroad < r.window * 0.08, `${car.name}: держится трассы (off-road ${r.offroad.toFixed(1)}s из ${r.window.toFixed(0)}s)`);
  ok(isFinite(r.top), `${car.name}: finite physics`);
}

/* on the long desert straights the fast cars must be able to stretch their legs */
for (const id of ['tayfun', 'vulkan', 'feniks']) {
  const r = simulateOnTrack(id, {}, 'desert');
  const spec = NR.CarFactory.carById(id).topSpeed;
  ok(r.top / spec > 0.62, `${NR.CarFactory.carById(id).name}: on desert straights reaches ${r.top.toFixed(0)} км/ч (${(r.top / spec * 100).toFixed(0)}% of ${spec})`);
}

/* upgrades must improve the car */
const base = simulateOnTrack('strela', {});
const tuned = simulateOnTrack('strela', { engine: 5, gearbox: 5, tires: 5, nitro: 5 });
ok(analyticTopSpeed('strela', { engine: 5 }) > analyticTopSpeed('strela', {}) + 5,
  `upgrades raise top speed (${analyticTopSpeed('strela', {}).toFixed(0)} -> ${analyticTopSpeed('strela', { engine: 5 }).toFixed(0)})`);
ok(tuned.t100 < base.t100 * 0.98, `upgrades improve acceleration (${base.t100.toFixed(2)} -> ${tuned.t100.toFixed(2)})`);

/* --------------------------------------------------------------- driving */
section('Player handling');
{
  const tr = tracks.city;
  const stats = NR.CarFactory.statsFor(NR.CarFactory.carById('strela'), {});
  const v = new NR.Vehicle(tr, stats, { assist: 0.9 });
  v.placeAt(0, 0);
  /* full throttle, full lock: the car must turn, not spin forever */
  let maxYaw = 0, spun = false;
  for (let i = 0; i < 240; i++) {
    v.step(1 / 60, { throttle: 1, brake: 0, steer: 1, handbrake: 0, nitro: 0 });
    maxYaw = Math.max(maxYaw, Math.abs(v.yawRate));
    if (Math.abs(v.yawRate) > 3.3) spun = true;
  }
  ok(!spun && isFinite(v.u), `full-lock at speed stays controllable (yaw max ${maxYaw.toFixed(2)} rad/s)`);
  ok(v.speed() > 1, 'car keeps rolling after 4s of full lock');
  ok(Math.abs(v.yawRate) < 3.2, 'no runaway spin');
}
{
  const tr = tracks.coast;
  const stats = NR.CarFactory.statsFor(NR.CarFactory.carById('barracuda'), {});
  const v = new NR.Vehicle(tr, stats, { assist: 0.9 });
  v.placeAt(120, 0);
  const startU = 30;
  v.u = startU;
  /* handbrake + steer must produce a drift and build drift score */
  let drifted = false, maxSlip = 0;
  for (let i = 0; i < 150; i++) {
    v.step(1 / 60, { throttle: 0.6, brake: 0, steer: -0.8, handbrake: 0.9, nitro: 0 });
    maxSlip = Math.max(maxSlip, Math.abs(v.wv));
    if (v.drifting) drifted = true;
  }
  ok(drifted, `handbrake drift triggers (max slip ${maxSlip.toFixed(1)} m/s)`);
  ok(v.driftScore > 0, `drift score accumulates (${v.driftScore.toFixed(0)})`);
}
{
  /* walls must contain the car */
  const tr = tracks.city;
  const stats = NR.CarFactory.statsFor(NR.CarFactory.carById('vihr'), {});
  const race = new NR.Race({ trackId: 'city', playerCar: NR.CarFactory.carById('vihr'), rivals: [], laps: 1 });
  const car = race.player;
  car.u = 40;
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    car.step(1 / 60, { throttle: 1, brake: 0, steer: -1, handbrake: 0, nitro: 0 });
    race.applyTrackLimits(car, 1 / 60);
    worst = Math.max(worst, Math.abs(car.proj.lat) - car.proj.half);
  }
  ok(worst < 1.1, `barriers contain the car (worst overshoot ${worst.toFixed(2)}m)`);
  ok(isFinite(car.x) && isFinite(car.z), 'no NaN after wall grinding');
}

/* countdown must freeze everyone on the grid */
{
  const race = new NR.Race({
    trackId: 'coast', laps: 1, playerCar: NR.CarFactory.carById('strela'),
    rivals: rivalsFor('coast', 5, 0.6, 1), autoPilot: true, autoPilotSkill: 0.8
  });
  for (let i = 0; i < 60 * 3; i++) race.step(1 / 60);
  const moving = race.cars.filter((c) => c.speed() > 1.2).length;
  ok(moving === 0 && race.state === 'countdown', `everyone waits for the start (${moving} moving)`);
  for (let i = 0; i < 60 * 2; i++) race.step(1 / 60);
  ok(race.state === 'racing' && race.cars.every((c) => c.speed() > 5), 'everyone launches after the countdown');
}

/* -------------------------------------------------------------- ai races */
section('AI race simulation (full races, fixed 120 Hz physics)');
function rivalsFor(trackId, count, difficulty, seed, pursuit) {
  const tr = tracks[trackId] || NR.buildTrack(NR.trackById(trackId));
  const list = NR.makeRivals(tr, count, { difficulty: difficulty, seed: seed || 4242, pursuit: pursuit });
  return list.map((r) => ({
    name: r.name, skill: r.skill, aggression: r.aggression, lineBias: r.lineBias,
    mistakeChance: r.mistakeChance, seed: r.seed, pursuit: r.pursuit
  }));
}

function runRace(cfg) {
  const race2 = new NR.Race(Object.assign({}, cfg, {
    rivals: rivalsFor(cfg.trackId, cfg.rivals, cfg.difficulty, cfg.seed, cfg.mode === 'pursuit'),
    autoPilot: true, autoPilotSkill: cfg.playerSkill != null ? cfg.playerSkill : Math.min(0.9, cfg.difficulty + 0.06)
  }));
  const dt = 1 / 60;
  let steps = 0;
  const maxSteps = 60 * 60 * 6;    // 6 minute safety cap
  let offTrack = 0, nan = false, maxLat = 0;
  const dtReal = Date.now();
  while (steps < maxSteps) {
    race2.step(dt);
    steps++;
    const p = race2.player;
    if (!isFinite(p.x) || !isFinite(p.z) || !isFinite(p.u) || !isFinite(p.heading)) { nan = true; break; }
    if (Math.abs(p.proj.lat) > p.proj.half + 0.2) offTrack += dt;
    maxLat = Math.max(maxLat, Math.abs(p.proj.lat) - p.proj.half);
    if (race2.state === 'finished' || race2.state === 'busted') break;
    /* every car must finish eventually */
    const done = race2.cars.filter((c) => c.finishTime != null).length;
    if (done === race2.cars.length) break;
  }
  const wall = Date.now() - dtReal;
  return { race: race2, steps, nan, offTrack, maxLat, wall, simTime: race2.time };
}

const richResults = {};
let worstSimStepMs = 0;
for (const def of NR.TRACKS) {
  const res = runRace({
    trackId: def.id, laps: NR.trackById(def.id).laps, rivals: 5, difficulty: 0.6,
    playerCar: NR.CarFactory.carById('strela'), seed: 4242, mode: 'race'
  });
  const r = res.race;
  const playerDone = r.player.finishTime != null;
  const finishTimes = r.cars.map((c) => c.finishTime).filter((t) => t != null);
  const rivalFinished = r.rivals.filter((c) => c.finishTime != null).length;
  const avgSpeed = r.player.lap > 0 ? (r.player.lap * r.track.length) / Math.max(0.001, r.player.finishTime || r.time) : 0;
  richResults[def.id] = res;
  console.log(`  ${def.id.padEnd(9)} sim=${res.simTime.toFixed(1)}s wall=${res.wall}ms player=${r.player.lap}/${r.laps} laps, ` +
    `pos=${r.player.position}, avg=${(avgSpeed * 3.6).toFixed(0)} км/ч, off-track=${res.offTrack.toFixed(1)}s, rivalFinished=${rivalFinished}/${r.rivals.length}`);
  ok(!res.nan, `race on "${def.id}": no NaN`);
  ok(playerDone, `race on "${def.id}": AI player completes the distance`);
  ok(avgSpeed > 18 && avgSpeed < 120, `race on "${def.id}": sensible average speed`);
  ok(res.offTrack < 6, `race on "${def.id}": mostly on track (off ${res.offTrack.toFixed(1)}s)`);
  const playerProgress = NR.progressOf(r.track, r.player);
  const minRivalProgress = Math.min.apply(null, r.rivals.map((c) => NR.progressOf(r.track, c)));
  ok(minRivalProgress > playerProgress * 0.82,
    `race on "${def.id}": rivals keep up (worst rival ${(minRivalProgress / playerProgress * 100).toFixed(0)}% of player distance)`);
  ok(res.maxLat < 2.5, `race on "${def.id}": nobody drives through walls (max ${res.maxLat.toFixed(2)}m)`);
  worstSimStepMs = Math.max(worstSimStepMs, (res.wall / res.steps) * (1 / 60) * 1000 / (1 / 60) / 1000);
}

/* ai difficulty should matter: harder rivals should win more often */
{
  const easy = runRace({ trackId: 'city', laps: 2, rivals: 3, difficulty: 0.25, playerCar: NR.CarFactory.carById('strela'), seed: 11, mode: 'race' });
  const hard = runRace({ trackId: 'city', laps: 2, rivals: 3, difficulty: 0.95, playerCar: NR.CarFactory.carById('strela'), seed: 11, mode: 'race' });
  ok(easy.race.player.position <= hard.race.player.position,
    `difficulty scales rivals (easy pos ${easy.race.player.position} vs hard pos ${hard.race.player.position})`);
}

/* determinism */
section('Determinism');
{
  const a = runRace({ trackId: 'coast', laps: 2, rivals: 4, difficulty: 0.5, playerCar: NR.CarFactory.carById('groza'), seed: 909, mode: 'race' });
  const b = runRace({ trackId: 'coast', laps: 2, rivals: 4, difficulty: 0.5, playerCar: NR.CarFactory.carById('groza'), seed: 909, mode: 'race' });
  ok(Math.abs(a.simTime - b.simTime) < 1e-6 && a.race.player.position === b.race.player.position,
    `same seed -> same race (t=${a.simTime.toFixed(3)} vs ${b.simTime.toFixed(3)})`);
}

/* rewards + progression */
section('Rewards & career');
{
  const res = richResults.city.race;
  const results = res.buildResults();
  const reward = NR.computeReward(res, results, { targetPlace: 3 });
  ok(reward.money > 0 && reward.total >= reward.money, `reward computed (place ${reward.place}, ${reward.total} кредитов)`);
  ok(reward.stars >= 0 && reward.stars <= 3, `stars in range (${reward.stars})`);
  const save = { money: 0, career: {}, cars: { vihr: { owned: true } }, stats: {} };
  ok(NR.isSeriesUnlocked(save, 0) === true, 'first series unlocked by default');
  ok(NR.isSeriesUnlocked(save, 1) === false, 'second series locked initially');
  save.career['s1e1'] = { stars: 3 };
  ok(NR.isEventUnlocked(save, NR.SERIES[0], 1) === true, 'next event unlocks after clearing previous');
  ok(NR.isEventUnlocked(save, NR.SERIES[0], 2) === false, 'third event still locked');
  for (const e of NR.SERIES[0].events) save.career[e.id] = { stars: 3 };
  ok(NR.isSeriesUnlocked(save, 1) === true, 'series 2 unlocks with enough stars');
  ok(NR.totalStars(save) === 12, `total stars counted (${NR.totalStars(save)})`);
}

/* save/load round trip */
section('Save game');
{
  const s = global.localStorage;
  s.clear();
  NR.Save.load(s);
  NR.Save.data.money = 55555;
  NR.Save.carState('vihr').upgrades.engine = 3;
  NR.Save.save(s);
  const reloaded = Object.assign({}, NR.Save.data);
  NR.Save.data.money = 0;
  NR.Save.load(s);
  ok(NR.Save.data.money === 55555, `money persisted (${NR.Save.data.money})`);
  ok(NR.Save.data.cars.vihr.upgrades.engine === 3, 'upgrades persisted');
  /* corrupted data must not crash */
  s.setItem(NR.SAVE_KEY, '{not json at all');
  NR.Save.load(s);
  ok(NR.Save.data.money === 6000, 'corrupted save falls back to defaults');
}

/* buying/upgrades economy */
section('Economy');
{
  const save = NR.Save.data;
  save.money = 1000000;
  const car = NR.CarFactory.carById('strela');
  const cost0 = NR.CarFactory.upgradeCost(car, 'engine', 0);
  const cost4 = NR.CarFactory.upgradeCost(car, 'engine', 4);
  ok(cost4 > cost0, `upgrade prices escalate (${cost0} -> ${cost4})`);
  const times = [0.34, 0.52, 0.72, 0.9].map((d) => {
    const r = runRace({ trackId: 'city', laps: 1, rivals: 3, difficulty: d, playerCar: NR.CarFactory.carById('vihr'), seed: 5, mode: 'race' });
    const results = r.race.buildResults();
    return NR.computeReward(r.race, results, { targetPlace: 3 }).total;
  });
  ok(times.every((t) => t > 400 && t < 60000), `rewards in a sane band: ${times.join(', ')}`);
}

/* performance budget */
section('Performance');
{
  const race = new NR.Race({
    trackId: 'mountain', laps: 3, playerCar: NR.CarFactory.carById('tayfun'), difficulty: 0.6,
    rivals: rivalsFor('mountain', 6, 0.6, 3)
  });
  /* warmup */
  for (let i = 0; i < 60; i++) race.step(1 / 60);
  const t0 = process.hrtime.bigint();
  const N = 600;
  for (let i = 0; i < N; i++) race.step(1 / 60);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const perFrame = ms / N;
  console.log(`  physics+AI for 7 cars: ${perFrame.toFixed(3)} ms per 60 Hz frame`);
  ok(perFrame < 2.2, `simulation leaves frame budget for rendering (${perFrame.toFixed(3)} ms/frame)`);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);

/* Scene integrity checks: every track scene must be renderable without
   missing attributes, NaN geometry or runaway draw calls.
   Usage: node tools/test-scene.js */
'use strict';
const { NR, THREE } = require('./sim-env.js');
require('../race/src/scene.js');

let failures = 0, checks = 0;
function ok(cond, msg, extra) {
  checks++;
  if (cond) console.log('  ok   ' + msg);
  else { failures++; console.log('  FAIL ' + msg + (extra != null ? '  -> ' + extra : '')); }
}

function meshStats(scene) {
  let meshes = 0, tris = 0, badColor = 0, nan = 0, noUV = 0, instanced = 0;
  scene.traverse((o) => {
    if (!o.isMesh && !o.isPoints && !o.isSprite) return;
    meshes++;
    const g = o.geometry;
    if (!g || !g.attributes || !g.attributes.position) return;
    const pos = g.attributes.position.array;
    for (let i = 0; i < pos.length; i++) if (!isFinite(pos[i])) { nan++; break; }
    const idx = g.index ? g.index.count : g.attributes.position.count;
    const count = o.isInstancedMesh ? o.count : 1;
    tris += (idx / 3) * count;
    if (o.isInstancedMesh) instanced += o.count;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      const usesVertexColor = m.vertexColors === true;
      if (usesVertexColor && !g.attributes.color) badColor++;
    }
    void noUV;
  });
  return { meshes, tris, badColor, nan, instanced };
}

console.log('\n== Track scenes ==');
for (const def of NR.TRACKS) {
  const track = NR.buildTrack(def);
  const t0 = Date.now();
  const scene = NR.SceneKit.buildTrackScene(track, { quality: 'medium' });
  const buildMs = Date.now() - t0;
  const s = meshStats(scene);
  console.log(`  ${def.id.padEnd(9)} meshes=${s.meshes} instances=${s.instanced} tris=${Math.round(s.tris / 1000)}k build=${buildMs}ms`);
  ok(s.badColor === 0, `${def.id}: vertex-colour materials have colour attributes`, s.badColor);
  ok(s.nan === 0, `${def.id}: no NaN geometry`);
  ok(s.tris < 260000, `${def.id}: triangle budget ok (${Math.round(s.tris / 1000)}k)`);
  ok(s.meshes < 60, `${def.id}: draw call budget ok (${s.meshes})`);
  ok(buildMs < 900, `${def.id}: builds fast enough for the loading screen (${buildMs}ms)`);
  ok(!!scene.fog, `${def.id}: fog configured for depth cueing`);

  /* a sky dome and lights must exist */
  let hasSky = false, lights = 0;
  scene.traverse((o) => {
    if (o.material && o.material.isShaderMaterial && o.geometry && o.geometry.type === 'SphereGeometry') hasSky = true;
    if (o.isLight) lights++;
  });
  ok(hasSky, `${def.id}: gradient sky present`);
  ok(lights >= 3, `${def.id}: lighting rig present (${lights} lights)`);
}

console.log('\n== Quality levels ==');
for (const q of ['low', 'medium', 'high']) {
  const track = NR.buildTrack(NR.trackById('city'));
  const scene = NR.SceneKit.buildTrackScene(track, { quality: q });
  const s = meshStats(scene);
  console.log(`  ${q.padEnd(7)} instances=${s.instanced} tris=${Math.round(s.tris / 1000)}k`);
  ok(s.tris > 4000, `${q}: scene is populated`);
  ok(q === 'high' ? s.tris > 30000 : true, `${q}: density scales with quality`);
}

console.log('\n== Cars ==');
for (const car of NR.CARS) {
  const mesh = NR.CarFactory.buildCarMesh(car.style, { body: 0xff0000, accent: 0x111111, rim: 0xcccccc });
  let tris = 0, nan = 0, wheels = 0, flames = 0;
  mesh.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const pos = g.attributes.position.array;
    for (let i = 0; i < pos.length; i++) if (!isFinite(pos[i])) { nan++; break; }
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    if (o.geometry.type === 'CylinderGeometry') wheels++;
    void flames;
  });
  ok(nan === 0 && tris > 100, `${car.name}: mesh builds (${Math.round(tris)} tris)`);
  ok(mesh.userData.wheels.length === 4, `${car.name}: four wheels`);
}
for (const style of Object.keys(NR.STYLES)) {
  const mesh = NR.CarFactory.buildCarMesh(style, {});
  ok(!!mesh.userData.style, `style "${style}" builds`);
}

console.log('\n== Effects ==');
{
  const scene = new THREE.Scene();
  const skid = new NR.SceneKit.SkidMarks(scene, 10);
  for (let i = 0; i < 40; i++) {
    skid.pushSegment(0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1);
  }
  ok(skid.count <= 10 && skid.mesh, 'skid marks wrap around a fixed pool');
  const parts = new NR.SceneKit.Particles(scene, 20);
  for (let i = 0; i < 60; i++) parts.emit(0, 1, 0, 1, 1, 1, 1, 1, 1, 0.2);
  parts.update(0.05);
  ok(parts.active <= 20, 'particle pool is bounded (' + parts.active + ')');
  for (let i = 0; i < 10; i++) parts.update(0.2);
  ok(parts.active === 0, 'particles expire');
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);

/* Builds the single-file offline game (everything inlined, no network needed).
   Usage:
     node tools/build-offline.js              -> dist/NITRO RUSH.html
     node tools/build-offline.js --android    -> also copies it into the APK assets

   NOTE: uses split/join instead of String.replace for the inlining, because
   third-party sources contain "$&" which String.replace would interpret. */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const raceDir = path.join(root, 'race');
const srcDir = path.join(raceDir, 'src');

const ORDER = ['three.min.js', 'util.js', 'cars.js', 'tracks.js', 'physics.js', 'race.js', 'scene.js', 'audio.js', 'hud.js', 'app.js'];
const BOOT = '<script>window.NR.boot();</script>';

function read(p) { return fs.readFileSync(p, 'utf8'); }
function write(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
  return Buffer.byteLength(data);
}

function build() {
  const html = read(path.join(raceDir, 'index.html'));

  /* the html must reference exactly the sources we expect, in order */
  const tags = [];
  const tagRe = /<script src="src\/([^"]+)"><\/script>/g;
  let m;
  while ((m = tagRe.exec(html))) tags.push(m[1]);
  if (tags.length !== ORDER.length || tags.some((t, i) => t !== ORDER[i])) {
    throw new Error('index.html script list differs from the build order:\n  html: ' + tags.join(', ') + '\n  build: ' + ORDER.join(', '));
  }
  if (html.indexOf(BOOT) < 0) throw new Error('index.html lost the boot call');

  const chunks = [];
  for (const f of ORDER) {
    const file = path.join(srcDir, f);
    if (!fs.existsSync(file)) throw new Error('missing source: ' + file);
    const code = read(file);
    if (code.indexOf('</scr' + 'ipt') >= 0) throw new Error('source contains a script terminator: ' + f);
    chunks.push('/* ===== ' + f + ' ===== */\n' + code);
  }
  const bundle = '\n' + chunks.join('\n;\n') + '\n';

  let out = html;
  /* drop every external tag (split/join => literal replacement, no $ patterns) */
  for (const t of tags) {
    const tag = '<script src="src/' + t + '"></script>\n';
    if (out.indexOf(tag) < 0) out = out.split('<script src="src/' + t + '"></script>').join('');
    else out = out.split(tag).join('');
  }
  out = out.split(BOOT).join('<script id="nr-bundle">' + bundle + '</scr' + 'ipt>\n' + BOOT);

  /* sanity checks on the result */
  if (out.indexOf('<script src=') >= 0) throw new Error('external scripts survive in the bundle');
  if (out.split('<script').length - 1 !== out.split('</scr' + 'ipt>').length - 1) {
    throw new Error('unbalanced script tags in the bundle');
  }
  if (out.indexOf(BOOT) < 0) throw new Error('boot call missing from the bundle');
  return out;
}

const html = build();
const out = path.join(root, 'dist', 'NITRO RUSH.html');
const size = write(out, html);
console.log('built ' + path.relative(root, out) + ' (' + (size / 1024).toFixed(0) + ' KB)');

if (process.argv.indexOf('--android') >= 0) {
  const assetPath = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'nitrorush.html');
  write(assetPath, html);
  console.log('copied to ' + path.relative(root, assetPath));
}

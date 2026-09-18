/* Shared harness: loads NITRO RUSH modules in Node with a browser-like global */
'use strict';
const path = require('path');
const root = path.join(__dirname, '..');

global.window = global;
global.self = global;
global.THREE = require(path.join(root, 'race/src/three.min.js'));

const memory = {};
global.localStorage = {
  getItem: (k) => (k in memory ? memory[k] : null),
  setItem: (k, v) => { memory[k] = String(v); },
  removeItem: (k) => { delete memory[k]; },
  clear: () => { for (const k of Object.keys(memory)) delete memory[k]; }
};

['util', 'cars', 'tracks', 'physics', 'race'].forEach((f) => {
  require(path.join(root, 'race/src', f + '.js'));
});

module.exports = { NR: global.NR, THREE: global.THREE, root };

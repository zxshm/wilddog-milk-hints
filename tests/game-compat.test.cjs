'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
function environment(blocked) {
  const nodes = new Map(), frames = [];
  const drawing = new Proxy({}, { get: () => () => {}, set: () => true });
  const element = id => {
    if (!nodes.has(id)) nodes.set(id, { style: {}, clientWidth: 400, offsetHeight: 50,
      getContext: () => drawing, addEventListener() {}, setAttribute() {}, getBoundingClientRect: () => ({ height: 50 }) });
    return nodes.get(id);
  };
  const sandbox = { console, performance, Event, CustomEvent, crypto: {}, innerWidth: 1000, innerHeight: 900,
    document: { getElementById: element, documentElement: { style: { setProperty() {} } } },
    Hints: { init() {}, invalidate() {} }, GameAssets: { images: [], prioritize() {} },
    addEventListener() {}, dispatchEvent() {}, requestAnimationFrame: fn => frames.push(fn),
    localStorage: { getItem: () => null, setItem() { throw new Error('存储配额耗尽'); } } };
  sandbox.window = sandbox;
  if (blocked) Object.defineProperty(sandbox, 'localStorage', { get() { throw new Error('存储访问被禁止'); } });
  vm.createContext(sandbox);
  for (const file of ['lib/matter.min.js', 'physics.js']) vm.runInContext(fs.readFileSync('dist/' + file, 'utf8'), sandbox);
  return { sandbox, element, frames };
}
for (const blocked of [false, true]) test(`真实游戏初始化、投放及计分兼容无 randomUUID 和${blocked ? '存储禁止访问' : '存储写入失败'}`, () => {
  const h = environment(blocked);
  vm.runInContext(fs.readFileSync('dist/game.js', 'utf8'), h.sandbox);
  assert.equal(h.sandbox.Game.initialized, true); assert.equal(h.frames.length, 1);
  assert.equal(h.sandbox.Game.place(180), true);
  assert.equal(h.sandbox.Game.state().bodies.length, 1);
  vm.runInContext('addScore(12, 180, 600)', h.sandbox);
  assert.equal(h.element('score').textContent, 12); assert.equal(h.element('best').textContent, 12);
  const id = vm.runInContext('rankRunId', h.sandbox);
  assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  vm.runInContext('reset()', h.sandbox);
  assert.notEqual(vm.runInContext('rankRunId', h.sandbox), id);
});

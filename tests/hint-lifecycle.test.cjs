'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('正常投放复用线程，中途取消终止旧线程，过期回复不能启用放置', () => {
  const elements = new Map(), workers = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, { handlers: {}, addEventListener(event, handler) { this.handlers[event] = handler; }, setAttribute() {} });
    return elements.get(id);
  };
  class FakeWorker {
    constructor() { this.terminated = false; workers.push(this); }
    postMessage(data) { this.request = data; }
    terminate() { this.terminated = true; }
  }
  const sandbox = { window: {}, document: { getElementById: element }, Worker: FakeWorker,
    localStorage: { getItem: () => null, setItem() {} }, location: { protocol: 'http:' }, GamePhysics: { W: 400 } };
  sandbox.Game = { layout() {}, state: () => ({ level: 0, nextLevel: 1, bodies: [], over: false, cooldown: 0 }),
    snapshot: () => ({ bodies: [] }), place() { sandbox.window.Hints.invalidate(); return true; } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/hints-persistent.js'), 'utf8'), sandbox);
  const hints = sandbox.window.Hints;
  const reply = (worker, id = worker.request.id) => worker.onmessage({ data: { id, result: {
    x: 100, nextX: 200, usedNext: true, totalGain: 2, totalMerges: 1, pairsExamined: 100, elapsed: 100, risk: 'low',
  } } });
  hints.init(); hints.tick(1000); hints.tick(1300);
  assert.equal(workers.length, 1);
  reply(workers[0]); hints.tick(1400);
  assert.equal(element('hintPlace').disabled, false);
  assert.equal(hints.place(), true);
  assert.equal(workers[0].terminated, false);
  hints.tick(1500); hints.tick(1800);
  assert.equal(workers.length, 1);
  const staleId = workers[0].request.id;
  hints.invalidate(); assert.equal(workers[0].terminated, true);
  hints.tick(1900); hints.tick(2200);
  assert.equal(workers.length, 2);
  reply(workers[0], staleId); hints.tick(2250);
  assert.equal(element('hintPlace').disabled, true);
  reply(workers[1]); hints.tick(2300);
  assert.equal(element('hintPlace').disabled, false);
  element('hintToggle').handlers.click();
  assert.equal(workers[1].terminated, true);
  assert.equal(hints.enabled, false);
});

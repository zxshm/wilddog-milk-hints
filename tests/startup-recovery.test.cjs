'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createBranchPool } = require('../dist/branch-pool.js');

test('子线程在第一批任务开始前加载失败，也会立即触发串行恢复', async () => {
  const workers = [];
  const pool = createBranchPool(() => { const worker = { postMessage() {}, terminate() { this.terminated = true; } }; workers.push(worker); return worker; }, 2);
  workers[0].onerror({ message: '首次依赖下载失败', preventDefault() {} });
  await assert.rejects(pool.mapBranches([10], {}, () => {}), /首次依赖下载失败/);
  pool.destroy(); assert.ok(workers.every(w => w.terminated));
});

test('创建中途不支持嵌套线程时，已创建的子线程全部释放', () => {
  const first = { terminate() { this.terminated = true; } }; let count = 0;
  assert.throws(() => createBranchPool(() => { if (count++) throw new Error('不支持嵌套线程'); return first; }, 2), /不支持嵌套线程/);
  assert.equal(first.terminated, true);
});

test('子线程无返回时批次超时退出，允许主计算线程接管', async () => {
  const timers = new Map(); let index = 0;
  const sandbox = { module: { exports: {} }, setTimeout(fn) { const id = ++index; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } };
  vm.runInNewContext(fs.readFileSync('dist/branch-pool.js', 'utf8'), sandbox);
  const pool = sandbox.module.exports.createBranchPool(() => ({ postMessage() {}, terminate() {} }), 2);
  const result = pool.mapBranches([1, 2], {}, () => {});
  const assertion = assert.rejects(result, /长时间未返回/);
  timers.values().next().value(); await assertion; pool.destroy();
  assert.equal(timers.size, 0);
});

function harness() {
  const elements = new Map(), workers = [], timers = new Map(); let serial = 0, clock = 0;
  const element = id => {
    if (!elements.has(id)) elements.set(id, { handlers: {}, addEventListener(k, v) { this.handlers[k] = v; }, setAttribute() {} });
    return elements.get(id);
  };
  const result = { x: 100, nextX: 200, usedNext: true, totalGain: 2, totalMerges: 1, pairsExamined: 10, elapsed: 20, risk: 'low' };
  const sandbox = { window: {}, document: { getElementById: element }, GamePhysics: { W: 400 }, location: { protocol: 'http:' },
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout(fn, delay) { const id = ++clock; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); },
    Worker: class { constructor() { workers.push(this); } postMessage(data) { this.request = data; } terminate() { this.terminated = true; } },
    PlacementSolver: { async solve() { serial++; return result; } },
    Game: { layout() {}, state: () => ({ level: 0, nextLevel: 1, bodies: [], over: false, cooldown: 0 }), snapshot: () => ({ bodies: [] }) } };
  vm.runInNewContext(fs.readFileSync('dist/hints-persistent.js', 'utf8'), sandbox);
  const hints = sandbox.window.Hints; hints.init(); hints.tick(1000); hints.tick(1300);
  return { hints, workers, timers, element, result, serial: () => serial,
    timeout() { const [id, timer] = timers.entries().next().value; timers.delete(id); timer.fn(); } };
}

test('首个计算线程加载失败后自动重建，不要求整页刷新', () => {
  const h = harness(), first = h.workers[0];
  first.onerror({ preventDefault() {} });
  assert.equal(h.workers.length, 2); assert.equal(first.terminated, true);
  const second = h.workers[1];
  second.onmessage({ data: { ready: true } });
  second.onmessage({ data: { id: second.request.id, result: h.result } });
  h.hints.tick(1400);
  assert.equal(h.element('hintPlace').disabled, false); assert.equal(h.serial(), 0); assert.equal(h.timers.size, 0);
});

test('计算线程首次一直不响应会被恢复，持续不响应时使用同算法兼容计算', async () => {
  const h = harness(); h.timeout();
  assert.equal(h.workers.length, 2); assert.equal(h.workers[0].terminated, true);
  h.timeout(); await Promise.resolve(); await Promise.resolve(); h.hints.tick(1400);
  assert.equal(h.serial(), 1); assert.equal(h.element('hintPlace').disabled, false);
  assert.equal(h.timers.size, 0);
});

test('取消请求后，旧线程迟到的错误不会终止新线程或启动过期计算', () => {
  const h = harness(), first = h.workers[0]; h.hints.invalidate();
  h.hints.tick(1800); h.hints.tick(2100);
  const second = h.workers[1]; first.onerror({ preventDefault() {} });
  assert.equal(second.terminated, undefined); assert.equal(h.serial(), 0);
  second.onmessage({ data: { id: second.request.id, result: h.result } }); h.hints.tick(2200);
  assert.equal(h.element('hintPlace').disabled, false);
});

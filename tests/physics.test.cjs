'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Matter = require('../dist/lib/matter.min.js');
const P = require('../dist/physics.js');
const Solver = require('../dist/solver.js');
const advance = (w, frames) => { for (let i = 0; i < frames; i++) w.step(); };

test('原版样式、主要界面结构与全部贴图保持不变', () => {
  const original = execFileSync('git', ['show', 'original-before-hints-b170dd7:index.html'], { encoding: 'utf8' });
  const current = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(current.match(/<style>[\s\S]*?<\/style>/)[0], original.match(/<style>[\s\S]*?<\/style>/)[0]);
  assert.equal(current.match(/<header[\s\S]*?<canvas id="chain"[^>]*><\/canvas>/)[0], original.match(/<header[\s\S]*?<canvas id="chain"[^>]*><\/canvas>/)[0]);
  for (let i = 1; i <= 11; i++) {
    const baseline = execFileSync('git', ['show', `original-before-hints-b170dd7:img/${i}.png`]);
    assert.deepEqual(fs.readFileSync(path.join(__dirname, `../dist/img/${i}.png`)), baseline);
  }
});

function originalGame() {
  const html = execFileSync('git', ['show', 'original-before-hints-b170dd7:index.html'], { encoding: 'utf8' });
  const code = html.match(/<script>\n([\s\S]*?)\n<\/script>/)[1];
  const noop = () => {};
  const canvas = new Proxy({}, { get: (_, name) => name === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop, set: () => true });
  const elements = new Map();
  const getElementById = id => {
    if (!elements.has(id)) elements.set(id, { style: {}, clientWidth: 400, offsetHeight: 90, getContext: () => canvas, addEventListener: noop, setAttribute: noop, focus: noop });
    return elements.get(id);
  };
  const sandbox = { Matter, console, document: { getElementById }, localStorage: { getItem: () => null, setItem: noop }, Image: function () {}, requestAnimationFrame: noop, setTimeout: noop, innerWidth: 800, innerHeight: 1000, window: { devicePixelRatio: 1, addEventListener: noop } };
  vm.createContext(sandbox); vm.runInContext(code, sandbox);
  return { run: code => vm.runInContext(code, sandbox), sandbox };
}

test('共享物理规则与原版连续 360 帧一致（落下、碰撞、合成、生长）', () => {
  const original = originalGame(), w = new P.World();
  const fixtures = [[0, 100, 680, 0], [0, 100, 570, .08], [1, 160, 660, -.1], [2, 280, 650, .3], [1, 120, 450, 0]];
  for (const f of fixtures) { w.spawn(...f); original.run(`makeCarton(${f.join(',')})`); }
  for (let i = 0; i < 360; i++) {
    w.step(); original.run('update(STEP / 1000)');
  }
  const expected = JSON.parse(original.run('JSON.stringify({score,over,bodies:cartons().map(b=>({lv:b.lv,x:b.position.x,y:b.position.y,angle:b.angle,k:b.k}))})'));
  assert.equal(w.score, expected.score); assert.equal(w.over, expected.over);
  assert.equal(w.cartons().length, expected.bodies.length);
  w.cartons().forEach((b, i) => {
    const e = expected.bodies[i]; assert.equal(b.lv, e.lv);
    assert.ok(Math.abs(b.position.x - e.x) < 1e-7); assert.ok(Math.abs(b.position.y - e.y) < 1e-7);
    assert.ok(Math.abs(b.angle - e.angle) < 1e-7); assert.equal(b.k, e.k);
  });
  w.destroy();
});

test('两盒终极奶合并消失并获得 1000 分', () => {
  const w = new P.World(); w.spawn(10, 190, 570); w.spawn(10, 210, 570);
  w.step(); assert.equal(w.score, 1000); assert.equal(w.cartons().length, 0); w.destroy();
});

test('短暂越线不会立即结束，落定越线持续两秒才失败', () => {
  const w = new P.World();
  const b = w.spawn(0, 100, 120); Matter.Body.setStatic(b, true);
  advance(w, 100); assert.equal(w.over, false);
  advance(w, 100); assert.equal(w.over, true); w.destroy();
});

test('快照保留圆角几何、旋转、速度和生长比例，模拟不修改原局面', () => {
  const w = new P.World(); const b = w.spawn(8, 190, 500, .41, .5);
  Matter.Body.setVelocity(b, { x: .7, y: 1.2 }); advance(w, 3);
  const s = w.snapshot(), frozen = JSON.stringify(s), clone = P.World.restore(s);
  assert.equal(clone.cartons()[0].vertices.length, b.vertices.length);
  clone.cartons()[0].vertices.forEach((v, i) => {
    assert.ok(Math.abs(v.x - b.vertices[i].x) < 1e-7); assert.ok(Math.abs(v.y - b.vertices[i].y) < 1e-7);
  });
  Solver.simulate(s, 0, 100);
  assert.equal(JSON.stringify(s), frozen); assert.equal(JSON.stringify(w.snapshot()), frozen);
  clone.destroy(); w.destroy();
});

test('推荐合法位置，并找到单盒可直接合成的落点', async () => {
  const w = new P.World(); w.spawn(0, 85, 680); advance(w, 180);
  const r = await Solver.solve(w.snapshot(), 0, 1, { mode: 'fast' });
  assert.ok(r.x >= P.LEVELS[0].w / 2 + 1 && r.x <= 400 - P.LEVELS[0].w / 2 - 1);
  assert.ok(r.gain >= 2, JSON.stringify(r)); assert.ok(Math.abs(r.x - 85) < 40);
  console.log('直接合成提示：', JSON.stringify(r)); w.destroy();
});

test('最高堆叠风险的评分低于低处安全放置', () => {
  const safe = new P.World(), danger = new P.World();
  safe.spawn(0, 200, 680); danger.spawn(0, 200, 120); danger.dangerT = 1.5;
  assert.ok(Solver.evaluate(safe, 0).value > Solver.evaluate(danger, 0).value);
  safe.destroy(); danger.destroy();
});

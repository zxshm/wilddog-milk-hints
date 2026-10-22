'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { World, LEVELS, clampX } = require('../dist/physics.js');
const Solver = require(process.env.SOLVER_FILE || '../dist/solver.js');

test('第一步造出下一盒可接续的目标，报告两步总合成', async () => {
  const w = new World(); w.spawn(0, 85, 680);
  for (let i = 0; i < 180; i++) w.step();
  const before = w.snapshot();
  const r = await Solver.solve(before, 0, 1, { mode: 'fast', budgetMs: 0, diagnostics: true });
  assert.equal(r.usedNext, true);
  assert.equal(r.gain, 2); assert.equal(r.nextGain, 6); assert.equal(r.totalGain, 8);
  assert.equal(r.totalMerges, 2);
  assert.equal(r.nextX, clampX(1, r.nextX));
  assert.ok(r.branches.every(b => b.nextPositions >= Solver.MODES.fast.second));
  assert.ok(r.pairsExamined > r.examined * Solver.MODES.fast.second);
  assert.deepEqual(w.snapshot(), before);
  w.destroy();
});

test('时间预算为零时也完成两步比较，不退化成只选前三名的单步搜索', async () => {
  const w = new World();
  const r = await Solver.solve(w.snapshot(), 0, 0, { mode: 'balanced', budgetMs: 0, diagnostics: true });
  assert.equal(r.usedNext, true); assert.equal(r.totalGain, 2);
  assert.equal(r.branches.length, Solver.MODES.balanced.first);
  for (const b of r.branches) assert.ok(b.nextPositions >= Solver.MODES.balanced.second);
  assert.ok(r.pairsExamined >= r.examined * Solver.MODES.balanced.second);
  w.destroy();
});

test('下一盒改变时重新评估两步结果，不伪造不可见的第三盒', async () => {
  const w = new World(), s = w.snapshot();
  const matching = await Solver.solve(s, 0, 0, { mode: 'fast' });
  const different = await Solver.solve(s, 0, 4, { mode: 'fast' });
  assert.equal(matching.totalGain, 2); assert.equal(different.totalGain, 0);
  assert.equal(different.nextLevel, 4);
  assert.ok(different.nextX >= LEVELS[4].w / 2 + 1);
  assert.equal(different.usedNext, true);
  w.destroy();
});

test('取消计算后不继续返回可执行路线', async () => {
  const w = new World();
  await assert.rejects(Solver.solve(w.snapshot(), 0, 1, { cancelled: () => true }), /已取消/);
  w.destroy();
});

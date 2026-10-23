'use strict';
// 按实际投放时刻重放浏览器对局，保留等待提示期间发生的运动，不把时间压成固定四秒。
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { World, STEP } = require('../dist/physics.js');
const log = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!log.initial || !log.final) throw new Error('旧记录缺少初始快照与准确投放时刻，不能精确重放');
const w = World.restore(log.initial);
const advance = time => {
  const steps = Math.round((time - w.time) / (STEP / 1000));
  assert.ok(steps >= 0 && steps < 1000000, '记录中的时刻无效');
  for (let i = 0; i < steps; i++) w.step();
  assert.ok(Math.abs(time - w.time) < 1e-7, '物理时钟未能对齐');
};
try {
  for (const row of log.route) {
    assert.ok(Number.isFinite(row.x), `第 ${row.move} 步缺少准确落点`);
    advance(row.time);
    assert.equal(w.score, row.score, `第 ${row.move} 步投放前得分`);
    assert.equal(w.cartons().length, row.boxes, `第 ${row.move} 步投放前盒子数`);
    w.drop(row.level, row.x);
  }
  advance(log.final.time);
  assert.equal(w.score, log.final.score);
  assert.equal(w.maxLv, log.final.maxLv);
  assert.equal(w.over, log.final.over);
  const snapshot = w.snapshot();
  assert.equal(snapshot.bodies.length, log.final.bodies.length);
  let maxError = 0;
  snapshot.bodies.forEach((b, i) => {
    const expected = log.final.bodies[i];
    assert.equal(b.lv, expected.lv);
    for (const key of ['x', 'y', 'angle', 'vx', 'vy', 'av']) maxError = Math.max(maxError, Math.abs(b[key] - expected[key]));
  });
  assert.ok(maxError < 1e-7, `终局运动状态偏差过大：${maxError}`);
  console.log(JSON.stringify({ moves: log.route.length, score: w.score, maxLevel: w.maxLv + 1, over: w.over,
    allMovesMatched: true, maxFinalStateError: maxError }));
} finally { w.destroy(); }

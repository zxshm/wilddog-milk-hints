'use strict';
// 固定随机种子的连续局面检查，用于确认推荐链路长期可用，不代表保证通关。
const { World, SPAWN_WEIGHTS } = require('../dist/physics.js');
const { solve } = require('../dist/solver.js');
function rng(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
function level(w, random) {
  const cap = Math.min(SPAWN_WEIGHTS.length, Math.max(3, w.maxLv));
  let n = random() * SPAWN_WEIGHTS.slice(0, cap).reduce((a, b) => a + b, 0);
  for (let i = 0; i < cap; i++) { n -= SPAWN_WEIGHTS[i]; if (n < 0) return i; }
  return 0;
}
(async () => {
  const w = new World(), random = rng(20261022), start = performance.now();
  let current = level(w, random), next = level(w, random), moves = 0, maxMs = 0;
  for (; moves < 100 && !w.over; moves++) {
    const r = await solve(w.snapshot(), current, next, { mode: 'balanced' });
    maxMs = Math.max(maxMs, r.elapsed);
    if (!Number.isFinite(r.x) || r.x < 0 || r.x > 400) throw new Error('非法推荐位置');
    w.drop(current, r.x); current = next; next = level(w, random);
    for (let i = 0; i < 240 && !w.over; i++) w.step();
    if ((moves + 1) % 20 === 0) console.log(JSON.stringify({ moves: moves + 1, score: w.score, level: w.maxLv + 1, boxes: w.cartons().length }));
  }
  console.log(JSON.stringify({ moves, score: w.score, maxLevel: w.maxLv + 1, over: w.over, maxSolveMs: maxMs, totalSeconds: +((performance.now() - start) / 1000).toFixed(1) }));
  w.destroy();
})();

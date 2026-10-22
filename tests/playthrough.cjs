'use strict';
// 完整对局验收：只执行提示，直到合成最高级、失败或超出步数上限。
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
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
  const seed = Number(process.argv[2] || 20261022), limit = Number(process.argv[3] || 1000);
  const mode = process.argv[4] || 'balanced', label = process.argv[5] || 'acceptance';
  const w = new World(), random = rng(seed), start = performance.now();
  let current = level(w, random), next = level(w, random), moves = 0, maxMs = 0;
  const route = [];
  for (; moves < limit && !w.over && w.maxLv < 10; moves++) {
    const r = await solve(w.snapshot(), current, next, { mode });
    maxMs = Math.max(maxMs, r.elapsed);
    if (!Number.isFinite(r.x) || r.x < 0 || r.x > 400) throw new Error('非法推荐位置');
    const item = { move: moves + 1, level: current, next, x: r.x, nextX: r.nextX, predictedGain: r.totalGain ?? r.gain, solveMs: r.elapsed };
    w.drop(current, r.x); current = next; next = level(w, random);
    for (let i = 0; i < 240 && !w.over; i++) w.step();
    Object.assign(item, { score: w.score, maxLevel: w.maxLv + 1, boxes: w.cartons().length }); route.push(item);
    if ((moves + 1) % 25 === 0) console.log(JSON.stringify({ seed, moves: moves + 1, score: w.score, level: w.maxLv + 1, boxes: w.cartons().length, seconds: Math.round((performance.now() - start) / 1000) }));
  }
  const result = { seed, mode, moves, won: w.maxLv === 10, score: w.score, maxLevel: w.maxLv + 1, over: w.over, maxSolveMs: maxMs, totalSeconds: +((performance.now() - start) / 1000).toFixed(1), source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() };
  fs.mkdirSync(path.join(__dirname, '../output/acceptance'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, `../output/acceptance/${label}-${seed}.json`), JSON.stringify({ result, route, final: w.snapshot() }, null, 2));
  console.log(JSON.stringify(result));
  w.destroy();
  if (!result.won) process.exitCode = 1;
})();

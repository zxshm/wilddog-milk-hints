'use strict';
// 完整对局验收：只执行提示；持续模式在首次通关后继续到失败或步数上限。
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { World, SPAWN_WEIGHTS } = require('../dist/physics.js');
const solverFile = process.argv[6] || 'solver.js';
const solverPath = path.join(__dirname, '../dist', solverFile);
const { solve } = require(solverPath);
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
  const endless = process.argv.includes('--endless');
  // 在开局时固定源码身份，避免测试运行期间提交文档影响归属。
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const files = [...new Set([solverFile, 'physics.js', 'lib/matter.min.js', 'branch-pool.js',
    ...(solverFile === 'solver-plan.js' ? ['solver-future.js', 'layout.js'] : [])])];
  const hashes = Object.fromEntries(files.map(name => [name,
    createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../dist', name))).digest('hex')]));
  const startedAt = new Date().toISOString();
  let finalMerges = 0, firstWin = null;
  const w = new World(event => { if (event.special) finalMerges++; }), random = rng(seed), start = performance.now();
  const workers = Number(process.argv[7] || 0), pool = workers ? require('./node-pool.cjs')(workers, solverPath) : null;
  let current = level(w, random), next = level(w, random), moves = 0, maxMs = 0;
  const route = [];
  for (; moves < limit && !w.over && (endless || w.maxLv < 10); moves++) {
    const r = await solve(w.snapshot(), current, next, { mode, mapBranches: pool?.mapBranches });
    maxMs = Math.max(maxMs, r.elapsed);
    if (!Number.isFinite(r.x) || r.x < 0 || r.x > 400) throw new Error('非法推荐位置');
    const item = { move: moves + 1, level: current, next, x: r.x, nextX: r.nextX, predictedGain: r.totalGain ?? r.gain,
      solveMs: r.elapsed, simulations: r.simulations, stages: r.stages };
    w.drop(current, r.x); current = next; next = level(w, random);
    for (let i = 0; i < 240 && !w.over; i++) w.step();
    Object.assign(item, { score: w.score, maxLevel: w.maxLv + 1, boxes: w.cartons().length }); route.push(item);
    if (!firstWin && w.maxLv === 10) firstWin = { move: moves + 1, score: w.score };
    if ((moves + 1) % 25 === 0) console.log(JSON.stringify({ seed, moves: moves + 1, score: w.score, level: w.maxLv + 1, boxes: w.cartons().length, seconds: Math.round((performance.now() - start) / 1000) }));
  }
  const result = { seed, mode, endless, moves, won: w.maxLv === 10, score: w.score, maxLevel: w.maxLv + 1, over: w.over, stopReason: w.over ? 'overflow' : moves >= limit ? 'move-limit' : 'first-win', firstWin, finalMerges, maxSolveMs: maxMs, totalSeconds: +((performance.now() - start) / 1000).toFixed(1), source, hashes, startedAt, simulatedStepsPerMove: 240, solverFile, workers };
  fs.mkdirSync(path.join(__dirname, '../output/acceptance'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, `../output/acceptance/${label}-${seed}.json`), JSON.stringify({ result, route, final: w.snapshot() }, null, 2));
  console.log(JSON.stringify(result));
  w.destroy();
  pool?.destroy();
  if (!result.won) process.exitCode = 1;
})();

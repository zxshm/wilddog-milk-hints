'use strict';
// 交错启动独立进程进行预热和测量；一次只运行一组，避免争抢 CPU 和 JIT 相互污染。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { World } = require('../dist/physics.js');
const fixture = require('./fixtures/failed-route-42.json');
const root = path.resolve(__dirname, '..');
const signature = result => Object.fromEntries(['x', 'nextX', 'value', 'totalGain', 'totalMerges', 'risk',
  'examined', 'pairsExamined', 'simulations', 'futureSimulations', 'branches'].filter(k => k in result).map(k => [k, result[k]]));

async function measure(variant, solverFile, workers) {
  const file = variant === 'before' ? path.join(__dirname, 'reference-solver.cjs') : path.join(root, 'dist', solverFile);
  const Solver = require(file), pool = workers ? require('./node-pool.cjs')(workers, file) : null;
  const cases = [], w = new World();
  for (let i = 0; i < 250; i++) {
    if ([34, 119, 249].includes(i)) cases.push({ move: i + 1, snapshot: w.snapshot(), level: fixture.route[i].level, next: fixture.route[i + 1].level });
    w.drop(fixture.route[i].level, fixture.route[i].x);
    for (let frame = 0; frame < 240; frame++) w.step();
  }
  w.destroy();
  try {
    for (let round = 0; round < 3; round++) for (const c of cases) {
      const started = performance.now();
      const result = await Solver.solve(c.snapshot, c.level, c.next, { mode: 'balanced', diagnostics: true, mapBranches: pool?.mapBranches });
      console.log(JSON.stringify({ variant, round, move: c.move, boxes: c.snapshot.bodies.length,
        ms: performance.now() - started, result: signature(result) }));
    }
  } finally { pool?.destroy(); }
}

if (process.argv[2] === '--child') {
  measure(process.argv[3], process.argv[4], Number(process.argv[5])).catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const solverFile = process.argv[2] || 'solver-optimized.js', workers = Number(process.argv[3] || 4);
  const rows = [], baseline = new Map();
  for (const variant of ['before', 'after', 'after', 'before']) {
    const child = spawnSync(process.execPath, [__filename, '--child', variant, solverFile, String(workers)], {
      cwd: root, encoding: 'utf8', env: { ...process.env, REFERENCE_SOLVER_FILE: solverFile }, maxBuffer: 10 * 1024 * 1024,
    });
    if (child.status !== 0) throw new Error(child.stderr || child.stdout);
    for (const line of child.stdout.trim().split('\n')) {
      const row = JSON.parse(line);
      if (!baseline.has(row.move)) baseline.set(row.move, row.result);
      assert.deepEqual(row.result, baseline.get(row.move), `第 ${row.move} 步搜索结果发生变化`);
      rows.push(row);
    }
    console.log(`${variant} 一组完成，全部候选排名和数值完全一致`);
  }
  const median = values => { const xs = [...values].sort((a, b) => a - b); return (xs[(xs.length - 1) >> 1] + xs[xs.length >> 1]) / 2; };
  const summary = [35, 120, 250].map(move => {
    const ms = variant => median(rows.filter(r => r.move === move && r.variant === variant && r.round > 0).map(r => r.ms));
    const before = ms('before'), after = ms('after');
    return { move, beforeMs: Math.round(before), afterMs: Math.round(after), savedPercent: +((1 - after / before) * 100).toFixed(1), speedup: +(before / after).toFixed(2) };
  });
  const hashes = Object.fromEntries([solverFile, 'physics.js', 'branch-pool.js'].map(name => [name,
    createHash('sha256').update(fs.readFileSync(path.join(root, 'dist', name))).digest('hex')]));
  const report = { date: new Date().toISOString(), node: process.version, solverFile, workers, hashes,
    referenceRevision: process.env.REFERENCE_REVISION || 'ac91039404bbf0a5520448f5f5d60971563f1fb4',
    warmupRounds: 1, measuredSamplesPerCase: 4, allResultsIdentical: true, summary, rows };
  fs.mkdirSync(path.join(root, 'output/performance'), { recursive: true });
  fs.writeFileSync(path.join(root, 'output/performance', `search-speed-${solverFile}-${workers}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(summary));
}

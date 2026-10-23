'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { World } = require('../dist/physics.js');
const Solver = require('../dist/solver-future.js');
process.env.REFERENCE_SOLVER_FILE = 'solver-future.js';
const Reference = require('./reference-solver.cjs');
delete process.env.REFERENCE_SOLVER_FILE;
const createPool = require('./node-pool.cjs');

test('概率前瞻三档精度在两线程下均保留旧版候选、排序和推荐结果', async () => {
  const w = new World(), pool = createPool(2, path.resolve(__dirname, '../dist/solver-future.js'));
  try {
    w.spawn(0, 70, 670, .1); w.spawn(1, 160, 660, -.2); w.spawn(2, 270, 640, .3);
    for (let i = 0; i < 180; i++) w.step();
    const s = w.snapshot(), frozen = JSON.stringify(s);
    for (const mode of ['fast', 'balanced', 'deep']) {
      const a = await Reference.solve(s, 0, 2, { mode, diagnostics: true });
      const b = await Solver.solve(s, 0, 2, { mode, diagnostics: true, mapBranches: pool.mapBranches });
      for (const key of ['x', 'nextX', 'value', 'totalGain', 'totalMerges', 'risk', 'examined',
        'pairsExamined', 'simulations', 'futureSimulations', 'branches']) assert.deepEqual(b[key], a[key], `${mode}: ${key}`);
      assert.equal(JSON.stringify(s), frozen);
    }
  } finally { pool.destroy(); w.destroy(); }
});

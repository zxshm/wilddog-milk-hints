'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { World } = require('../dist/physics.js');
const Solver = require('../dist/solver-plan.js');
const createPool = require('./node-pool.cjs');

test('布局搜索的串行与四线程结果一致，第三盒揭晓后能选择第二步备选', async () => {
  const w = new World(), pool = createPool(4, path.resolve(__dirname, '../dist/solver-plan.js'));
  try {
    w.spawn(0, 70, 670, .1); w.spawn(1, 160, 660, -.2); w.spawn(2, 270, 640, .3);
    for (let i = 0; i < 180; i++) w.step();
    const s = w.snapshot(), frozen = JSON.stringify(s);
    const serial = await Solver.solve(s, 0, 2, { mode: 'balanced', diagnostics: true });
    const parallel = await Solver.solve(s, 0, 2, { mode: 'balanced', diagnostics: true, mapBranches: pool.mapBranches });
    for (const key of ['x', 'nextX', 'value', 'totalGain', 'risk', 'simulations', 'branches', 'futureBranches']) {
      assert.deepEqual(parallel[key], serial[key], key);
    }
    assert.equal(JSON.stringify(s), frozen);
    assert.ok(parallel.futureBranches.length > 1);
    for (const branch of parallel.futureBranches) {
      assert.equal(branch.choices.length, 2);
      assert.notEqual(branch.choices[0].nextX, branch.choices[1].nextX);
      assert.ok(branch.choices.every(choice => branch.value >= choice.value - 1e-6));
      assert.ok(Math.abs(branch.choices[0].levels.reduce((sum, level) => sum + level.probability, 0) - 1) < 1e-12);
    }
    assert.equal(parallel.x, parallel.futureBranches[0].x);
  } finally { pool.destroy(); w.destroy(); }
});

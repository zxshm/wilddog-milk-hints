'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { World } = require('../dist/physics.js');
const Baseline = require('../dist/solver.js');
const Optimized = require('../dist/solver-optimized.js');
const createPool = require('./node-pool.cjs');
const fixture = require('./fixtures/failed-route-42.json');

test('并行搜索在真实前中后期局面中保留全部候选、落点、收益和排序', async () => {
  const pool = createPool(4), w = new World();
  try {
    for (let i = 0; i < 250; i++) {
      if ([34, 119, 249].includes(i)) {
        const s = w.snapshot(), lv = fixture.route[i].level, next = fixture.route[i + 1].level;
        const a = await Baseline.solve(s, lv, next, { mode: 'balanced', diagnostics: true });
        const b = await Optimized.solve(s, lv, next, { mode: 'balanced', diagnostics: true, mapBranches: pool.mapBranches });
        for (const key of ['x', 'nextX', 'value', 'totalGain', 'totalMerges', 'examined', 'pairsExamined', 'simulations', 'risk', 'branches']) {
          assert.deepEqual(b[key], a[key], `第 ${i + 1} 步 ${key} 不一致`);
        }
      }
      w.drop(fixture.route[i].level, fixture.route[i].x);
      for (let frame = 0; frame < 240; frame++) w.step();
    }
  } finally { pool.destroy(); w.destroy(); }
});

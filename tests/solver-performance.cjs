'use strict';
// 用同一批真实堆叠比较耗时与落点，性能优化前后必须保留搜索规模和结果。
const fs = require('node:fs');
const path = require('node:path');
const { World } = require('../dist/physics.js');
const fixture = require('./fixtures/failed-route-42.json');
const moduleName = process.argv[2] || 'dist/solver.js';
const Solver = require(path.resolve(__dirname, '..', moduleName));
const rounds = Number(process.argv[3] || 2);
const checkpoints = [35, 120, 250], cases = [], w = new World();
for (let i = 0; i < 250; i++) {
  if (checkpoints.includes(i + 1)) cases.push({ move: i + 1, snapshot: w.snapshot(), level: fixture.route[i].level, next: fixture.route[i + 1].level });
  w.drop(fixture.route[i].level, fixture.route[i].x);
  for (let frame = 0; frame < 240; frame++) w.step();
}
w.destroy();
(async () => {
  const results = [];
  for (let round = 0; round < rounds; round++) for (const c of cases) {
    const started = performance.now();
    const r = await Solver.solve(c.snapshot, c.level, c.next, { mode: 'balanced' });
    const row = { round, move: c.move, boxes: c.snapshot.bodies.length, ms: Math.round(performance.now() - started),
      x: r.x, nextX: r.nextX, value: r.value, totalGain: r.totalGain, examined: r.examined, pairs: r.pairsExamined, simulations: r.simulations };
    results.push(row); console.log(JSON.stringify(row));
  }
  fs.mkdirSync(path.join(__dirname, '../output/performance'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '../output/performance', path.basename(moduleName) + '.json'), JSON.stringify(results, null, 2));
})();

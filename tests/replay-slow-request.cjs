'use strict';
// 使用浏览器验收保存的准确输入重算，区分可复现的搜索耗时与运行环境长尾。
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const logPath = path.resolve(process.argv[2]);
const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
const index = Number(process.argv[3] || 0), slow = log.slowRequests?.[index];
if (!slow) throw new Error('指定记录没有可重放的慢请求快照');
const file = slow.reply.result?.version === 'joint-7-layout' ? 'solver-plan.js' : 'solver-future.js';
const modulePath = path.resolve(__dirname, '../dist', file), Solver = require(modulePath);
// 重放前验证所有已记录的脚本，避免拿修改后的版本对旧慢请求作出错误归因。
for (const [name, hash] of Object.entries(log.manifest.hashes || {})) {
  const actual = createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../dist', name))).digest('hex');
  if (actual !== hash) throw new Error(`脚本已变化，请切回记录版本后再重放：${name}`);
}
(async () => {
  const pool = require('./node-pool.cjs')(4, modulePath), rows = [];
  try {
    for (let round = 0; round < 4; round++) {
      const { snapshot, level, nextLevel, mode } = slow.request;
      const result = await Solver.solve(snapshot, level, nextLevel, { mode, mapBranches: pool.mapBranches });
      const row = { round, warmup: round === 0, elapsed: result.elapsed, stages: result.stages,
        x: result.x, nextX: result.nextX, simulations: result.simulations };
      rows.push(row); console.log(JSON.stringify(row));
    }
    const out = path.join(__dirname, '../output/performance/slow-request-replay.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ logPath, index, original: slow.reply.result, roundTripMs: slow.roundTripMs, rows }, null, 2));
  } finally { pool.destroy(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

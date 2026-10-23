'use strict';
// 汇总真实浏览器保存的对局，不改变原始记录；终极消除次数由等级质量守恒交叉计算。
const fs = require('node:fs'), assert = require('node:assert/strict');
const file = process.argv[2], data = JSON.parse(fs.readFileSync(file, 'utf8'));
const { result, route, initial, final } = data;
assert.equal(route.length, result.moves);
assert.equal(final.score, result.score);
const mass = bodies => bodies.reduce((sum, body) => sum + 2 ** body.lv, 0);
const removed = mass(initial.bodies) + route.reduce((sum, move) => sum + 2 ** move.level, 0) - mass(final.bodies);
const finalMerges = removed / 2048;
assert.ok(Number.isInteger(finalMerges) && finalMerges >= 0);
const stat = values => {
  values = values.filter(Number.isFinite).sort((a, b) => a - b);
  return { median: values[Math.floor(values.length / 2)], p95: values[Math.floor(values.length * .95)], max: values.at(-1) };
};
const after = route.filter(move => move.move > (result.firstWin?.move ?? Infinity));
const summary = { result, finalMerges, version: [...new Set(route.map(r => r.diagnostics?.version))], searchMs: stat(route.map(r => r.diagnostics?.elapsed)),
  afterFirstWinMoves: after.length, afterFirstWinProbabilitySearches: after.filter(r => r.diagnostics?.futureSimulations > 0).length,
  stopIsNatural: result.stopReason === 'overflow' && final.over, manifest: data.manifest, userAgent: data.userAgent };
fs.writeFileSync(file.replace(/\.json$/, '-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, manifest: undefined }));

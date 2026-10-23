'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
test('共享榜单持久化、分组、个人最高、重复提交和身份校验', async () => {
  const { default: worker } = await import('../worker/index.mjs');
  const db = new DatabaseSync(':memory:');
  for (const file of fs.readdirSync('drizzle').filter(f => f.endsWith('.sql'))) db.exec(fs.readFileSync('drizzle/' + file, 'utf8'));
  const env = { DB: { prepare(sql) { return { bind(...args) { const s = db.prepare(sql); return { first: async () => s.get(...args), all: async () => ({ results: s.all(...args) }), run: async () => ({ meta: s.run(...args) }) }; } }; } } };
  async function call(path, data, auth) { return worker.fetch(new Request('https://api.test/api/' + path, { method: data ? 'POST' : 'GET', headers: { Origin: 'https://zxshm.github.io', 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth.id + ':' + auth.token } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) }), env); }
  const a = await (await call('players', {})).json(), b = await (await call('players', {})).json();
  const score = { runId: crypto.randomUUID(), nickname: '测试甲', mode: 'player', score: 400, moves: 30, maxLevel: 5, duration: 60 };
  assert.equal((await call('scores', score, a)).status, 201);
  assert.equal((await (await call('scores', score, a)).json()).duplicate, true);
  assert.equal((await call('scores', score, b)).status, 409);
  assert.equal((await call('scores', { ...score, runId: crypto.randomUUID() }, a)).status, 429);
  assert.equal((await call('scores', { ...score, runId: crypto.randomUUID(), nickname: '<img>' }, b)).status, 400);
  assert.equal((await call('scores', score, { ...a, token: '0'.repeat(72) })).status, 401);
  db.exec('UPDATE players SET last_submit = 0');
  await call('scores', { ...score, runId: crypto.randomUUID(), score: 600 }, a);
  await call('scores', { ...score, runId: crypto.randomUUID(), nickname: '自动乙', mode: 'auto', score: 1000 }, b);
  const response = await call('leaderboard');
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://zxshm.github.io');
  assert.deepEqual((await response.json()).entries.map(e => e.score), [600]);
  assert.deepEqual((await (await call('leaderboard?mode=auto')).json()).entries.map(e => e.score), [1000]);
  assert.equal((await worker.fetch(new Request('https://api.test/api/leaderboard', { headers: { Origin: 'https://bad.test' } }), env)).status, 403);
  db.close();
});

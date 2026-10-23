'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { createHash, randomUUID } = require('node:crypto');

test('独立服务器隔离私有文件、兼容新旧入口、迁移身份和成绩并在重启后保留', async t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'dogmilk-test-'));
  const env = { ...process.env, PORT: '4189', DOGMILK_DB: path.join(folder, 'board.sqlite') };
  const identity = { id: randomUUID(), token: randomUUID() + randomUUID() };
  const seed = { players: [{ id: identity.id, token_hash: createHash('sha256').update(identity.token).digest('hex'), created_at: 100, last_submit: 0 }], scores: [{ run_id: randomUUID(), player_id: identity.id, nickname: '历史玩家', mode: 'player', score: 1112, moves: 106, max_level: 8, duration: 251, created_at: 100 }] };
  const migrate = () => spawnSync(process.execPath, ['server/import.mjs'], { env, input: JSON.stringify(seed), encoding: 'utf8' });
  assert.equal(migrate().status, 0);
  let child;
  const start = async () => {
    child = spawn(process.execPath, ['server/index.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('服务器启动失败'); })]);
  };
  const stop = async () => { const exited = once(child, 'exit'); child.kill(); await exited; };
  t.after(async () => { if (child.exitCode === null) await stop(); fs.rmSync(folder, { recursive: true, force: true }); });
  await start();
  const base = 'http://127.0.0.1:4189';
  let r = await fetch(base + '/'); assert.equal(r.status, 200); assert.match(await r.text(), /server-v13/);
  for (const privatePath of ['/data/leaderboard.sqlite', '/.git/config', '/server/index.js', '/.openai/hosting.json', '/__qa/acceptance']) assert.equal((await fetch(base + privatePath)).status, 404);
  const img = await fetch(base + '/img/11.png'); assert.equal(img.status, 200); assert.equal((await fetch(base + '/img/11.png', { headers: { 'If-None-Match': img.headers.get('etag') } })).status, 304);
  for (const origin of ['https://zxshm.github.io', 'https://dogmilk.zxshm.dpdns.org']) {
    r = await fetch(base + '/api/leaderboard', { headers: { Origin: origin } }); assert.equal(r.headers.get('access-control-allow-origin'), origin); assert.equal((await r.json()).entries[0].score, 1112);
  }
  assert.equal((await fetch(base + '/api/leaderboard', { headers: { Origin: 'https://bad.test' } })).status, 403);
  assert.equal((await fetch(base + '/api/players', { method: 'POST', body: 'x'.repeat(3000) })).status, 413);
  const score = { runId: randomUUID(), nickname: '迁移后玩家', mode: 'player', score: 1200, moves: 110, maxLevel: 8, duration: 300 };
  const submit = () => fetch(base + '/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://zxshm.github.io', Authorization: `Bearer ${identity.id}:${identity.token}` }, body: JSON.stringify(score) });
  assert.equal((await submit()).status, 201); assert.equal((await (await submit()).json()).duplicate, true);
  await stop(); assert.equal(migrate().status, 0); await start();
  assert.equal((await (await fetch(base + '/api/leaderboard')).json()).entries[0].score, 1200);
  assert.equal(spawnSync(process.execPath, ['server/backup.mjs'], { env }).status, 0);
});

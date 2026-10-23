'use strict';
// 只上报指定的真实验收记录；身份凭据仅存在于当前进程，不写入证据或终端。
const fs = require('node:fs'), assert = require('node:assert/strict');
const api = 'https://wilddog-milk-hints-20261022.zhangqiongxingzhe.chatgpt.site/api';
(async () => {
  const evidence = process.argv[2], nickname = process.argv[3];
  if (!evidence || !nickname) throw new Error('需要真实验收文件和测试昵称');
  const { result } = JSON.parse(fs.readFileSync(evidence, 'utf8'));
  const post = async (endpoint, data, token) => {
    const response = await fetch(api + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) }, body: JSON.stringify(data), signal: AbortSignal.timeout(15000) });
    const reply = await response.json(); assert.ok(response.ok, JSON.stringify(reply)); return reply;
  };
  const player = await post('/players', {}), auth = `Bearer ${player.id}:${player.token}`;
  const payload = { nickname, runId: crypto.randomUUID(), mode: 'auto', score: result.score, moves: result.moves, maxLevel: result.maxLevel, duration: Math.round(result.totalSeconds ?? result.seconds) };
  assert.equal((await post('/scores', payload, auth)).saved, true);
  assert.equal((await post('/scores', payload, auth)).duplicate, true);
  const response = await fetch(api + '/leaderboard?mode=auto', { signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  assert.ok(data.entries.some(e => e.nickname === nickname && e.score === result.score));
  fs.mkdirSync('output/deployment', { recursive: true });
  fs.writeFileSync('output/deployment/ranking-live.json', JSON.stringify({ checkedAt: new Date().toISOString(), evidence, submitted: payload, publicReadback: data, duplicatePrevented: true }, null, 2));
  console.log(JSON.stringify({ sharedSaved: true, anonymousReadback: true, duplicatePrevented: true, nickname, score: result.score }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });

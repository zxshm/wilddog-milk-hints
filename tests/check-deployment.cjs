'use strict';
// 对照 Git 中的正式文件核对部署，避免 Windows 换行转换造成误报。
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const base = process.argv[2] || 'https://zxshm.github.io/wilddog-milk-hints/';
const release = 'layout-v7-20261023';
const hash = value => createHash('sha256').update(value).digest('hex');
(async () => {
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const html = execFileSync('git', ['show', 'HEAD:dist/index.html'], { cwd: root, encoding: 'utf8' });
  const files = [...new Set(['index.html', ...[...html.matchAll(/<script src="([^"?]+)/g)].map(m => m[1]),
    'hint-worker-persistent.js', 'hint-branch-worker.js', 'branch-pool.js'])];
  const results = [];
  for (const file of files) {
    const url = new URL(file, base); url.searchParams.set('v', release);
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200, file);
    const remoteHash = hash(Buffer.from(await response.arrayBuffer()));
    const gitHash = hash(execFileSync('git', ['show', `HEAD:dist/${file}`], { cwd: root }));
    assert.equal(remoteHash, gitHash, `${file} 尚未更新到验收版本`);
    results.push({ file, sha256: gitHash, matched: true });
  }
  const report = { checkedAt: new Date().toISOString(), base, release, source, allMatched: true, files: results };
  fs.mkdirSync(path.join(root, 'output/deployment'), { recursive: true });
  fs.writeFileSync(path.join(root, 'output/deployment/layout-v7-online.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ source, release, matchedFiles: results.length, allMatched: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });

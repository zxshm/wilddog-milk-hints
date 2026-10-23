'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('发布版本沿主线程、嵌套线程及所有物理和算法依赖传递', async () => {
  for (const file of ['hint-worker-persistent.js', 'hint-branch-worker.js']) {
    const imported = [], nested = [];
    const sandbox = { URL, performance, onmessage: null, navigator: { hardwareConcurrency: 8 },
      self: { location: { href: `https://example.test/${file}?strategy=plan&v=layout-v7-20261023` } },
      importScripts: (...names) => imported.push(...names), postMessage() {},
      Worker: class { constructor(url) { nested.push(url); } },
      PlacementSolver: { solve: async () => ({}) },
      createBranchPool: create => { for (let i = 0; i < 4; i++) create(); return { mapBranches() {}, drainTimings: () => [] }; },
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8'), sandbox);
    if (file === 'hint-worker-persistent.js') {
      await sandbox.onmessage({ data: { id: 1, mode: 'balanced' } });
      assert.equal(nested.length, 4);
    }
    assert.ok(imported.some(name => name.startsWith('layout.js?')));
    assert.ok(imported.some(name => name.startsWith('solver-plan.js?')));
    for (const name of [...imported, ...nested]) {
      const url = new URL(name, 'https://example.test/');
      assert.equal(url.searchParams.get('v'), 'layout-v7-20261023', name);
      if (name.startsWith('hint-branch-worker.js')) assert.equal(url.searchParams.get('strategy'), 'plan');
    }
  }
});

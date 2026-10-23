'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderQaPage } = require('../serve.cjs');
const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
const scripts = text => [...text.matchAll(/<script src="([^"]+)"/g)].map(m => m[1].split('?')[0]);

test('切换正式入口后，旧算法验收页仍独立加载所选版本', () => {
  const plan = renderQaPage(html, 'plan', '{}');
  const future = renderQaPage(plan, 'future', '{}');
  assert.ok(scripts(future).includes('solver-future.js'));
  assert.ok(!scripts(future).includes('solver-plan.js'));
  assert.ok(!scripts(future).includes('layout.js'));
  assert.match(future, /data-worker="hint-worker-persistent.js\?strategy=future"/);
  const original = renderQaPage(plan, 'acceptance', '{}');
  assert.ok(scripts(original).includes('solver.js'));
  assert.ok(scripts(original).includes('hints.js'));
  assert.ok(!scripts(original).includes('solver-future.js'));
});
test('布局入口按依赖顺序加载，原版物理与游戏入口保持单份', () => {
  const names = scripts(renderQaPage(html, 'plan', '{}'));
  const expected = ['lib/matter.min.js', 'physics.js', 'leaderboard.js', 'solver-future.js', 'layout.js', 'solver-plan.js', 'hints-persistent.js', 'game.js'];
  assert.deepEqual(names.filter(name => !name.startsWith('/__qa/')), expected);
});

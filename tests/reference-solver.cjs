'use strict';
// 从优化前的固定 Git 提交加载对照版本，避免复制一份会随修改漂移的基线。
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const revision = process.env.REFERENCE_REVISION || 'ac91039404bbf0a5520448f5f5d60971563f1fb4';
function load(name, physics) {
  const filename = path.join(root, 'dist', name), instance = new Module(filename, module);
  instance.filename = filename; instance.paths = module.paths;
  const normalRequire = Module.createRequire(filename);
  instance.require = id => id === './physics.js' && physics ? physics : normalRequire(id);
  instance._compile(execFileSync('git', ['show', `${revision}:dist/${name}`], { cwd: root, encoding: 'utf8' }), filename);
  return instance.exports;
}
module.exports = load(process.env.REFERENCE_SOLVER_FILE || 'solver-optimized.js', load('physics.js'));

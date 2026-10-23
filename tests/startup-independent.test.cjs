'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');

test('全部图片请求悬而未决时，依赖脚本和游戏仍可启动；图案晚到不会再次初始化游戏', async () => {
  const nodes = new Map(), scripts = [], preloads = [], pendingImages = [], timers = new Map(), events = [];
  const window = new EventTarget();
  window.addEventListener('wilddog:ready', () => events.push('ready'));
  window.addEventListener('wilddog:texture', () => events.push('texture'));
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: true, append() {}, remove() { this.removed = true; } });
    return nodes.get(id);
  };
  const templates = ['lib/matter.min.js', 'physics.js', 'solver-plan.js', 'hints-persistent.js', 'game.js'].map(src => ({ getAttribute: () => src, dataset: {} }));
  const document = { currentScript: { src: 'https://example.test/startup.js?v=independent-v12' }, baseURI: 'https://example.test/',
    getElementById: node, querySelectorAll: selector => selector.startsWith('script') ? templates : [],
    createElement: () => ({ dataset: {}, remove() {} }),
    head: { append: element => preloads.push(element) },
    body: { append: script => { scripts.push(script.src); queueMicrotask(() => script.onload()); } } };
  let serial = 0;
  const sandbox = { window, document, URL, Event, CustomEvent, location: { protocol: 'https:' },
    setTimeout(fn) { const id = ++serial; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    Image: class { set src(value) { if (value) pendingImages.push(this); } } };
  vm.runInNewContext(fs.readFileSync('dist/startup.js', 'utf8'), sandbox);
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  await flush();
  assert.equal(window.GameAssets.images.filter(Boolean).length, 0);
  assert.equal(events.filter(event => event === 'ready').length, 1);
  assert.equal(node('loadingPanel').removed, true);
  assert.equal(node('textureNotice').hidden, false);
  assert.equal(preloads.length, templates.length);
  assert.equal(scripts.filter(src => src.endsWith('/game.js')).length, 1);
  assert.equal(pendingImages.length, 3);
  // 图片仍未返回时，重复的网络恢复事件不能重开对局或重复下载同一批图案。
  window.dispatchEvent(new Event('online')); await flush();
  assert.equal(scripts.filter(src => src.endsWith('/game.js')).length, 1);
  assert.equal(pendingImages.length, 3);
  while (pendingImages.length) {
    const img = pendingImages.shift(); img.naturalWidth = 40; img.onload(); await flush();
  }
  assert.equal(window.GameAssets.images.filter(Boolean).length, 11);
  assert.equal(events.filter(event => event === 'texture').length, 11);
  assert.equal(events.filter(event => event === 'ready').length, 1);
  assert.equal(node('textureNotice').hidden, true);
  assert.equal(timers.size, 0);
});

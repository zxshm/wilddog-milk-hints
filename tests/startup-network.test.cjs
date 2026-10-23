'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
function harness({ fail = false, runtime = false, optional = false } = {}) {
  const window = new EventTarget(), nodes = new Map(), requests = [], executed = [], timers = new Map();
  let serial = 0, ready = 0;
  window.addEventListener('wilddog:ready', () => ready++);
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: true, append() {}, remove() { this.removed = true; } });
    return nodes.get(id);
  };
  const templates = ['physics.js', 'game.js', 'leaderboard.js'].map(src => ({ getAttribute: () => src, dataset: {} }));
  const document = { baseURI: 'https://example.test/', getElementById: node,
    querySelectorAll: selector => selector.startsWith('script') ? templates : [],
    createElement: () => ({ dataset: {}, remove() {} }), body: { append(script) {
      const url = script.textContent.split('sourceURL=')[1]; executed.push(url);
      if (runtime) {
        const event = new Event('error'); event.error = new Error('模拟初始化异常'); window.dispatchEvent(event);
      } else if (url.endsWith('/game.js')) window.Game = { initialized: true, state: () => ({ level: 0, nextLevel: 1 }) };
    } } };
  const sandbox = { window, document, Event, CustomEvent, URL, location: { protocol: 'https:' },
    setTimeout(fn) { const id = ++serial; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    Image: class { set src(_) {} },
    XMLHttpRequest: class {
      open(method, url) { this.url = url; requests.push(this); }
      send() {
        if ((fail && requests.filter(r => r.url.includes('physics')).length === 1 && this.url.includes('physics')) || (optional && this.url.includes('leaderboard'))) return;
        this.status = 200; this.responseText = '// 模拟下载成功'; queueMicrotask(() => this.onload());
      }
    } };
  vm.runInNewContext(fs.readFileSync('dist/startup.js', 'utf8'), sandbox);
  return { window, node, requests, executed, timers, ready: () => ready };
}
test('核心请求超时重试，旧请求晚到也不执行两次，不重开对局', async () => {
  const h = harness({ fail: true }); await flush();
  assert.equal(h.ready(), 0);
  const first = h.requests[0]; assert.equal(first.timeout, 10000); first.ontimeout(); await flush();
  const [id, retry] = h.timers.entries().next().value; h.timers.delete(id); retry(); await flush();
  assert.equal(h.ready(), 1); assert.equal(h.node('loadingPanel').removed, true);
  first.status = 200; first.responseText = '// 超时后迟到的响应'; first.onload();
  h.window.dispatchEvent(new Event('online')); await flush();
  assert.equal(h.ready(), 1); assert.equal(h.executed.filter(url => url.endsWith('/physics.js')).length, 1);
  assert.equal(h.executed.filter(url => url.endsWith('/game.js')).length, 1);
});
test('排行榜脚本和图片一直不返回，核心仍启动', async () => {
  const h = harness({ optional: true }); await flush();
  assert.equal(h.ready(), 1); assert.equal(h.node('loadingPanel').removed, true);
  assert.equal(h.executed.some(url => url.includes('leaderboard')), false);
});
test('下载成功但执行异常不得伪报就绪，显示恢复入口', async () => {
  const h = harness({ runtime: true }); await flush();
  assert.equal(h.ready(), 0); assert.notEqual(h.node('loadingPanel').removed, true);
  assert.equal(h.node('loadingRetry').hidden, false);
  assert.match(h.window.GameStartup.error, /初始化异常/);
});
test('首页内联启动器和样式与源文件同步，不再请求外部样式', () => {
  const html = fs.readFileSync('dist/index.html', 'utf8');
  const inline = html.match(/<!-- 启动器内联开始 -->\s*<script>\n([\s\S]*?)\n<\/script>/)[1];
  assert.equal(inline, fs.readFileSync('dist/startup.js', 'utf8').replace(/\r\n/g, '\n'));
  assert.equal(/<script src="startup.js/.test(html), false);
  assert.equal(/<link[^>]+rel="stylesheet"/.test(html), false);
  const styles = [...html.matchAll(/<style data-source="([^"]+)">\n([\s\S]*?)\n<\/style>/g)];
  assert.equal(styles.length, 3);
  for (const [, name, css] of styles) assert.equal(css, fs.readFileSync('dist/' + name, 'utf8').replace(/\r\n/g, '\n'));
});

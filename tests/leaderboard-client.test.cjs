'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), { execFileSync } = require('node:child_process');
const source = fs.readFileSync('dist/leaderboard.js', 'utf8');
const board = { entries: [{ nickname: '兼容检查', score: 1112 }] };
function harness(code, fetcher, controller = AbortController) {
  const elements = new Map(), events = new Map(), calls = [], timers = new Set();
  const element = id => {
    if (elements.has(id)) return elements.get(id);
    const node = { children: [], value: '', textContent: '', open: false,
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      showModal() { this.open = true; }, close() { this.open = false; } };
    elements.set(id, node); return node;
  };
  const sandbox = { document: { getElementById: element, createElement: () => element(Symbol()), body: element('body') },
    window: { addEventListener: (name, handler) => events.set(name, handler) },
    localStorage: { getItem: () => null, setItem() {} }, location: { pathname: '/' },
    // 模拟旧手机内核：存在 AbortSignal，但缺少静态 timeout 方法。
    AbortSignal: {}, AbortController: controller,
    setTimeout(fn, delay) { const timer = setTimeout(() => { timers.delete(timer); fn(); }, delay === 800 ? 0 : delay); timers.add(timer); return timer; },
    clearTimeout(timer) { clearTimeout(timer); timers.delete(timer); },
    fetch: async (url, options) => { calls.push({ url, options }); return fetcher(calls.length, url, options); } };
  vm.runInNewContext(code, sandbox);
  return { element, events, calls, timers };
}
const success = () => ({ ok: true, json: async () => board });

test('旧版在缺少 AbortSignal.timeout 时立即失败，实际没有发出请求', async () => {
  const previous = execFileSync('git', ['show', 'before-first-load-fix-v11-20261023:dist/leaderboard.js'], { encoding: 'utf8' });
  const h = harness(previous, success);
  await h.element('rankRefresh').onclick();
  assert.equal(h.calls.length, 0);
  assert.match(h.element('rankStatus').textContent, /连接不上/);
});

for (const [name, controller] of [['缺少超时接口', AbortController], ['同时缺少中止控制器', null]]) {
  test(`手机内核${name}时仍能正常请求共享榜单`, async () => {
    const h = harness(source, success, controller);
    await h.element('rankButton').onclick();
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].options.credentials, 'omit');
    assert.equal(h.element('rankList').children[0].children[0].textContent, '兼容检查');
    assert.match(h.element('rankStatus').textContent, /已同步/);
    assert.equal(h.timers.size, 0);
  });
}

test('读取短暂失败自动重试，后续断网保留已读榜单并明确说明', async () => {
  let offline = false;
  const h = harness(source, count => { if (count === 1 || offline) throw new TypeError('网络断开'); return success(); });
  await h.element('rankRefresh').onclick();
  assert.equal(h.calls.length, 2); assert.match(h.element('rankStatus').textContent, /已同步/);
  offline = true; await h.element('rankRefresh').onclick();
  assert.equal(h.calls.length, 4); assert.equal(h.element('rankList').children.length, 1);
  assert.match(h.element('rankStatus').textContent, /上次读取/); assert.equal(h.timers.size, 0);
});

test('刷新顺序反转时，较早请求不能覆盖较新的榜单', async () => {
  let release;
  const h = harness(source, count => count === 1 ? new Promise(resolve => { release = resolve; }) : success());
  const first = h.element('rankRefresh').onclick();
  await h.element('rankRefresh').onclick();
  release({ ok: true, json: async () => ({ entries: [{ nickname: '较早请求', score: 1 }] }) });
  await first;
  assert.equal(h.element('rankList').children[0].children[0].textContent, '兼容检查');
  assert.equal(h.timers.size, 0);
});

test('成绩提交失败不自动重复创建身份或重复写入', async () => {
  const h = harness(source, (_, url) => {
    if (url.endsWith('/players')) return { ok: true, json: async () => ({ id: '测试身份', token: '测试令牌' }) };
    throw new TypeError('网络断开');
  });
  h.events.get('wilddog:over')({ detail: { score: 12 } });
  h.element('rankName').value = '测试昵称';
  await h.element('rankForm').onsubmit({ preventDefault() {} });
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls.every(call => call.options.method === 'POST'));
  assert.equal(h.element('rankSubmit').disabled, false); assert.equal(h.timers.size, 0);
});

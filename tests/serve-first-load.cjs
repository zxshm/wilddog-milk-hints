'use strict';
// 本地故障注入服务：各测试用新路径和禁用缓存，线上文件不加入任何故障开关。
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../dist'), cases = new Map();
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.png': 'image/png' };
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('Cache-Control', 'no-store');
  if (pathname === '/') { res.setHeader('Content-Type', types['.html']); res.end(fs.readFileSync(path.join(__dirname, 'first-load.html'))); return; }
  const evidence = pathname.match(/^\/__evidence\/([a-z0-9-]+)$/);
  if (evidence) {
    const state = cases.get(evidence[1]);
    if (req.method === 'POST' && state) state.online = true;
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(state?.log || [])); return;
  }
  const match = pathname.match(/^\/__cold\/([a-z0-9-]+)\/(.+)$/);
  if (!match) { res.writeHead(404); res.end(); return; }
  const [, id, relative] = match;
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  if (!cases.has(id)) cases.set(id, { counts: new Map(), log: [], online: false });
  const state = cases.get(id), count = (state.counts.get(relative) || 0) + 1;
  state.counts.set(relative, count);
  let fail = false, stalled = false;
  if (id.startsWith('retry-')) fail = (relative.startsWith('img/') && count <= 2) || (['startup.js', 'physics.js', 'mobile.css', 'hint-worker-persistent.js', 'hint-branch-worker.js'].includes(relative) && count === 1);
  if (id.startsWith('offline-') && relative === 'img/1.png' && !state.online) fail = true;
  if (id.startsWith('blocked-') && relative.startsWith('img/') && !state.online) fail = true;
  if (id.startsWith('stall-') && relative === 'hint-worker-persistent.js' && count === 1) stalled = true;
  const hanging = (id.startsWith('hang-') && relative === 'physics.js' && count === 1)
    || (id.startsWith('optional-') && (relative === 'leaderboard.js' || relative.endsWith('.css') || relative.startsWith('img/')));
  if (hanging) { state.log.push({ file: relative, attempt: count, status: 0, hanging: true }); return; }
  state.log.push({ file: relative, attempt: count, status: fail ? 503 : 200, ...(stalled ? { stalled: true } : {}) });
  if (fail) { res.writeHead(503); res.end('本地测试：模拟首次网络错误'); return; }
  if (stalled) { res.setHeader('Content-Type', types['.js']); res.end('/* 本地测试：模拟线程依赖长时间未完成 */'); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    if (relative === 'index.html' && id.startsWith('compat-')) {
      // 同时注入存储读取失败、写入失败以及旧内核缺少 randomUUID。
      data = data.toString().replace('<head>', `<head><script>
        Object.defineProperty(window, 'localStorage', { get() { throw new Error('本地测试：存储禁止访问'); } });
        Object.defineProperty(crypto, 'randomUUID', { value: undefined });
      </script>`);
    }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(data);
  });
}).listen(Number(process.env.PORT || 4174), '127.0.0.1', () => console.log('首次加载验收服务已启动'));

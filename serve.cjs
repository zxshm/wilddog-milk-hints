'use strict';
// 仅在本机启动静态服务；不需要安装依赖。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
http.createServer((req, res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); res.end(); return; }
  // 验收页只由本地服务提供，发布目录中不包含自动点击或加速脚本。
  if (['/__qa/acceptance', '/__qa/parallel', '/__qa/persistent', '/__qa/goal'].includes(name)) {
    let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
      .replace('<head>', '<head><base href="/"><script src="/__qa/clock.js"></script>')
      .replace('</body>', '<script src="/__qa/acceptance.js"></script></body>');
    if (name === '/__qa/parallel') html = html.replace('src="solver.js"', 'src="solver-optimized.js"')
      .replace('src="hints.js"', 'src="hints-optimized.js"');
    if (name === '/__qa/persistent') html = html.replace('src="solver.js"', 'src="solver-optimized.js"')
      .replace('src="hints.js"', 'src="hints-persistent.js"');
    if (name === '/__qa/goal') html = html.replace('src="solver.js"', 'src="solver-goal.js"')
      .replace('src="hints.js"', 'src="hints-goal.js"');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html); return;
  }
  const qaScripts = { '/__qa/clock.js': 'browser-clock.js', '/__qa/acceptance.js': 'browser-acceptance.js' };
  if (qaScripts[name]) {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(path.join(__dirname, 'tests', qaScripts[name]))); return;
  }
  const mobilePreview = name === '/__qa/mobile';
  const file = mobilePreview ? path.join(__dirname, 'tests', 'mobile.html') : path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!mobilePreview && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end('未找到文件'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log(`游戏已启动：http://127.0.0.1:${port}`));

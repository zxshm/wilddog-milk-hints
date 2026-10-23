'use strict';
// 仅在本机启动静态服务；不需要安装依赖。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const qaVariants = {
  acceptance: ['solver.js', 'hints.js'], parallel: ['solver-optimized.js', 'hints-optimized.js'],
  persistent: ['solver-optimized.js', 'hints-persistent.js'], goal: ['solver-goal.js', 'hints-goal.js'],
  future: ['solver-future.js', 'hints-persistent.js'],
  plan: ['solver-future.js', 'layout.js', 'solver-plan.js', 'hints-persistent.js'],
};
function renderQaPage(source, variant, manifest) {
  const scripts = qaVariants[variant].map(file => `<script src="${file}"${file === 'hints-persistent.js'
    && ['future', 'plan'].includes(variant) ? ` data-worker="hint-worker-persistent.js?strategy=${variant}"` : ''}></script>`).join('\n');
  // 正式入口换版本后，各实验入口仍明确加载自己的算法，避免旧对照页意外加载新版。
  return source.replace(/<script src="(?:solver(?:-[a-z]+)?|hints(?:-[a-z]+)?|layout)\.js"[^>]*><\/script>\s*/g, '')
    .replace('<script src="game.js">', `${scripts}\n<script src="game.js">`)
    .replace('<head>', '<head><base href="/"><script src="/__qa/clock.js"></script>')
    .replace('</body>', `<script id="qa-source" type="application/json">${manifest}</script><script src="/__qa/acceptance.js"></script></body>`);
}
const server = http.createServer((req, res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); res.end(); return; }
  // 验收页只由本地服务提供，发布目录中不包含自动点击或加速脚本。
  if (['/__qa/acceptance', '/__qa/parallel', '/__qa/persistent', '/__qa/goal', '/__qa/future', '/__qa/plan'].includes(name)) {
    let revision = '未知';
    try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: __dirname, encoding: 'utf8' }).trim(); } catch (_) {}
    const scriptFiles = ['lib/matter.min.js', ...fs.readdirSync(root).filter(file => file.endsWith('.js'))];
    const hashes = Object.fromEntries(scriptFiles.map(file => [file,
      createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
    const manifest = JSON.stringify({ revision, hashes, page: name, loadedAt: new Date().toISOString() });
    const html = renderQaPage(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), name.split('/').pop(), manifest);
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
});
if (require.main === module) server.listen(port, '127.0.0.1', () => console.log(`游戏已启动：http://127.0.0.1:${port}`));
module.exports = { renderQaPage };

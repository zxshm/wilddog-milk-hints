import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import worker from '../worker/index.mjs';
import { openDatabase, d1Adapter } from './database.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const db = openDatabase(process.env.DOGMILK_DB || fileURLToPath(new URL('../data/leaderboard.sqlite', import.meta.url)));
const env = { DB: d1Adapter(db) };
const version = 'server-v13-20261023';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
// 只额外开放用户指定的微信域名验证文件。
const verificationFiles = new Set(['8bcd2c24caf20cee09f578a660030251.txt']);
// 只发布游戏资源，不提供源码、数据库、部署配置或本地验收入口。
const assets = new Map();
for (const relative of [...fs.readdirSync(root).filter(f => /\.(html|js|css)$/.test(f) || verificationFiles.has(f)), ...['img', 'lib'].flatMap(dir => fs.readdirSync(path.join(root, dir)).map(f => dir + '/' + f))]) {
  const type = types[path.extname(relative)];
  if (!type) continue;
  const body = fs.readFileSync(path.join(root, relative));
  const text = /\.(html|js|css)$/.test(relative);
  assets.set('/' + relative, { body, type, etag: '"' + createHash('sha256').update(body).digest('hex') + '"', gzip: text ? gzipSync(body) : null, br: text ? brotliCompressSync(body) : null });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  let url;
  try { url = new URL(req.url, 'https://dogmilk.zxshm.dpdns.org'); } catch { res.writeHead(400); res.end(); return; }
  try {
    if (url.pathname === '/healthz' && req.method === 'GET') {
      db.prepare('SELECT 1').get();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, version })); return;
    }
    if (url.pathname.startsWith('/api/')) {
      if (!['GET', 'POST', 'OPTIONS'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      let size = 0; const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2048) { res.writeHead(413, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '请求过大' })); return; }
        chunks.push(chunk);
      }
      const headers = new Headers();
      for (const name of ['origin', 'content-type', 'authorization']) if (req.headers[name]) headers.set(name, req.headers[name]);
      const response = await worker.fetch(new Request(url, { method: req.method, headers, ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) }), env);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const asset = assets.get(url.pathname === '/' ? '/index.html' : url.pathname);
    if (!asset) { res.writeHead(404); res.end('Not found'); return; }
    const cache = url.pathname.startsWith('/img/') ? 'public, max-age=86400' : 'public, max-age=0, must-revalidate';
    const headers = { 'Content-Type': asset.type, 'Cache-Control': cache, ETag: asset.etag, Vary: 'Accept-Encoding' };
    if (req.headers['if-none-match'] === asset.etag) { res.writeHead(304, headers); res.end(); return; }
    const encoding = req.headers['accept-encoding'] || '';
    let body = asset.body;
    if (asset.br && /\bbr\b/.test(encoding)) { body = asset.br; headers['Content-Encoding'] = 'br'; }
    else if (asset.gzip && /\bgzip\b/.test(encoding)) { body = asset.gzip; headers['Content-Encoding'] = 'gzip'; }
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers); res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: '服务暂时不可用，请稍后重试' }));
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT || 4180), '127.0.0.1', () => console.log(`游戏服务已启动 ${version}`));
function stop() { server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);

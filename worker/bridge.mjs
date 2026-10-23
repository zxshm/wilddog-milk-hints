const TARGET = 'https://dogmilk.zxshm.dpdns.org';
const ORIGINS = new Set(['https://zxshm.github.io', TARGET, 'http://127.0.0.1:4173']);
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return Response.redirect('https://zxshm.github.io/wilddog-milk-hints/', 302);
    const origin = request.headers.get('Origin');
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (origin && !ORIGINS.has(origin)) return new Response(JSON.stringify({ error: '不支持此来源' }), { status: 403, headers });
    if (origin) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!['GET', 'POST'].includes(request.method) || !['/api/players', '/api/scores', '/api/leaderboard'].includes(url.pathname)) return new Response('{}', { status: 404, headers });
    const controller = new AbortController();
    // 兼容没有 AbortSignal.timeout 的边缘运行环境。
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      // 旧客户端身份继续有效；请求转向同一数据库，不重复提交或维护第二份榜单。
      const forwarded = new Headers();
      for (const name of ['Content-Type', 'Authorization', 'Origin']) if (request.headers.has(name)) forwarded.set(name, request.headers.get(name));
      const response = await fetch(TARGET + url.pathname + url.search, { method: request.method, headers: forwarded, ...(request.method === 'POST' ? { body: request.body } : {}), redirect: 'error', signal: controller.signal });
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      console.error('榜单转发失败', error.name, error.message);
      return new Response(JSON.stringify({ error: '排行榜暂时不可用，请稍后重试' }), { status: 503, headers });
    } finally { clearTimeout(timer); }
  },
};

const GAME = 'https://zxshm.github.io/wilddog-milk-hints/';
const ORIGINS = new Set(['https://zxshm.github.io', 'http://127.0.0.1:4173']);
const uuid = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(v => v.toString(16).padStart(2, '0')).join('');
export function validateScore(data) {
  const nickname = typeof data.nickname === 'string' ? data.nickname.normalize('NFC').trim() : '';
  if (!nickname || [...nickname].length > 16 || /[<>\p{Cc}\p{Cf}]/u.test(nickname)) throw new Error('昵称请填写 1～16 个普通字符');
  if (!uuid(data.runId) || !['player', 'auto'].includes(data.mode)) throw new Error('成绩格式错误');
  for (const key of ['score', 'moves', 'maxLevel', 'duration']) if (!Number.isSafeInteger(data[key])) throw new Error('成绩必须为整数');
  if (data.moves < 1 || data.moves > 1000000 || data.score < 0 || data.score > data.moves * 256 || data.maxLevel < 1 || data.maxLevel > 11 || data.duration < 1 || data.duration > 31536000) throw new Error('成绩超出合理范围');
  return { ...data, nickname };
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url), origin = request.headers.get('Origin');
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
    if (ORIGINS.has(origin)) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '600' });
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    if (!url.pathname.startsWith('/api/')) return Response.redirect(GAME, 302);
    if (origin && !ORIGINS.has(origin)) return json({ error: '不支持此来源' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
        const mode = url.searchParams.get('mode') === 'auto' ? 'auto' : 'player';
        // 每个浏览器身份只显示该分组最高成绩；同分时先达到者靠前。
        const { results } = await env.DB.prepare(`SELECT nickname, score, moves, max_level AS maxLevel, duration, created_at AS createdAt FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY score DESC, created_at ASC, run_id ASC) AS n
          FROM scores WHERE mode = ?
        ) WHERE n = 1 ORDER BY score DESC, created_at ASC, run_id ASC LIMIT 50`).bind(mode).all();
        return json({ mode, entries: results, updatedAt: Date.now(), verification: '客户端上报，未逐局回放验证' });
      }
      if (request.method !== 'POST') return json({ error: '接口不存在' }, 404);
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: '需要 JSON 数据' }, 415);
      const body = await request.text();
      if (body.length > 2048) return json({ error: '请求过大' }, 413);
      let data; try { data = JSON.parse(body); } catch { return json({ error: 'JSON 格式错误' }, 400); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return json({ error: '请求格式错误' }, 400);
      if (url.pathname === '/api/players') {
        const id = crypto.randomUUID(), token = crypto.randomUUID() + crypto.randomUUID();
        await env.DB.prepare('INSERT INTO players (id, token_hash, created_at) VALUES (?, ?, ?)').bind(id, await hash(token), Date.now()).run();
        return json({ id, token }, 201);
      }
      if (url.pathname !== '/api/scores') return json({ error: '接口不存在' }, 404);
      const [id, token] = (request.headers.get('Authorization') || '').replace(/^Bearer /, '').split(':');
      if (!uuid(id) || typeof token !== 'string' || token.length !== 72) return json({ error: '请重新连接排行榜' }, 401);
      const player = await env.DB.prepare('SELECT id FROM players WHERE id = ? AND token_hash = ?').bind(id, await hash(token)).first();
      if (!player) return json({ error: '身份已失效，请重新连接' }, 401);
      let value; try { value = validateScore(data); } catch (error) { return json({ error: error.message }, 400); }
      const old = await env.DB.prepare('SELECT player_id FROM scores WHERE run_id = ?').bind(value.runId).first();
      if (old) return old.player_id === id ? json({ saved: true, duplicate: true }) : json({ error: '对局编号冲突' }, 409);
      const now = Date.now();
      const allowed = await env.DB.prepare('UPDATE players SET last_submit = ? WHERE id = ? AND last_submit <= ?').bind(now, id, now - 5000).run();
      if (!allowed.meta.changes) return json({ error: '提交过于频繁，请稍后再试' }, 429);
      await env.DB.prepare('INSERT INTO scores (run_id, player_id, nickname, mode, score, moves, max_level, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(run_id) DO NOTHING')
        .bind(value.runId, id, value.nickname, value.mode, value.score, value.moves, value.maxLevel, value.duration, now).run();
      return json({ saved: true }, 201);
    } catch {
      return json({ error: '排行榜暂时不可用，请稍后重试' }, 503);
    }
  },
};

import fs from 'node:fs';
import { openDatabase } from './database.mjs';

const filename = process.env.DOGMILK_DB;
if (!filename) throw new Error('需要指定 DOGMILK_DB');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!Array.isArray(input.players) || !Array.isArray(input.scores)) throw new Error('迁移数据格式错误');
const db = openDatabase(filename);
// 导入前保存完整快照；重复导入只补充旧记录，不覆盖新服务器上的成绩。
const backup = filename + '.before-import-' + Date.now();
db.exec("VACUUM INTO '" + backup.replaceAll("'", "''") + "'");
db.exec('BEGIN IMMEDIATE');
try {
  const player = db.prepare('INSERT INTO players (id, token_hash, created_at, last_submit) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_submit = MAX(players.last_submit, excluded.last_submit)');
  for (const row of input.players) player.run(row.id, row.token_hash, row.created_at, row.last_submit);
  const score = db.prepare('INSERT INTO scores (run_id, player_id, nickname, mode, score, moves, max_level, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(run_id) DO NOTHING');
  for (const row of input.scores) {
    if (!db.prepare('SELECT id FROM players WHERE id = ?').get(row.player_id)) throw new Error('成绩缺少玩家身份');
    score.run(row.run_id, row.player_id, row.nickname, row.mode, row.score, row.moves, row.max_level, row.duration, row.created_at);
  }
  db.exec('COMMIT');
  console.log(JSON.stringify({ players: db.prepare('SELECT COUNT(*) AS n FROM players').get().n, scores: db.prepare('SELECT COUNT(*) AS n FROM scores').get().n }));
} catch (error) { db.exec('ROLLBACK'); throw error; } finally { db.close(); }

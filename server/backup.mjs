import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';

const filename = process.env.DOGMILK_DB;
if (!filename) throw new Error('需要指定 DOGMILK_DB');
const folder = path.resolve(path.dirname(filename), '../backups');
fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
const target = path.join(folder, 'leaderboard-' + new Date().toISOString().replaceAll(':', '-') + '.sqlite');
const db = new DatabaseSync(filename, { readOnly: true });
try { await backup(db, target); fs.chmodSync(target, 0o600); console.log('排行榜备份完成'); } finally { db.close(); }

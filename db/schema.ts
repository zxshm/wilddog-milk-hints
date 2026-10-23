import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const players = sqliteTable('players', {
  id: text('id').primaryKey(), tokenHash: text('token_hash').notNull(),
  createdAt: integer('created_at').notNull(), lastSubmit: integer('last_submit').notNull().default(0),
});
export const scores = sqliteTable('scores', {
  runId: text('run_id').primaryKey(), playerId: text('player_id').notNull(),
  nickname: text('nickname').notNull(), mode: text('mode').notNull(),
  score: integer('score').notNull(), moves: integer('moves').notNull(),
  maxLevel: integer('max_level').notNull(), duration: integer('duration').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => [index('scores_board').on(table.mode, table.score), index('scores_player').on(table.playerId)]);

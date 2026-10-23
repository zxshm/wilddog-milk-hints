CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_submit` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scores` (
	`run_id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`nickname` text NOT NULL,
	`mode` text NOT NULL,
	`score` integer NOT NULL,
	`moves` integer NOT NULL,
	`max_level` integer NOT NULL,
	`duration` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scores_board` ON `scores` (`mode`,`score`);--> statement-breakpoint
CREATE INDEX `scores_player` ON `scores` (`player_id`);
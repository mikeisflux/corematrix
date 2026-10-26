CREATE TABLE `perf_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`user_id` text,
	`label` text,
	`url` text,
	`device` text NOT NULL,
	`summary` text NOT NULL,
	`samples` text NOT NULL,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `perf_started_idx` ON `perf_sessions` (`started_at`);
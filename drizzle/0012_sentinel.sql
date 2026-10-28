CREATE TABLE `sentinel_errors` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`where` text NOT NULL,
	`message` text NOT NULL,
	`stack` text,
	`url` text,
	`ua` text,
	`visitor_id` text,
	`user_id` text,
	`count` integer DEFAULT 1 NOT NULL,
	`first_at` integer NOT NULL,
	`last_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE INDEX `sentinel_last_idx` ON `sentinel_errors` (`last_at`);--> statement-breakpoint
CREATE INDEX `sentinel_resolved_idx` ON `sentinel_errors` (`resolved_at`);

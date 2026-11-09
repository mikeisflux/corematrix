CREATE TABLE `favorites` (
	`user_id` text NOT NULL,
	`booth_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `booth_id`)
);
--> statement-breakpoint
CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`user_player_id` text,
	`blocked_user_id` text,
	`blocked_player_id` text,
	`name` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `blocks_user_idx` ON `blocks` (`user_id`);
--> statement-breakpoint
CREATE INDEX `blocks_blocked_user_idx` ON `blocks` (`blocked_user_id`);
--> statement-breakpoint
CREATE INDEX `blocks_blocked_player_idx` ON `blocks` (`blocked_player_id`);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text NOT NULL,
	`target_user_id` text,
	`target_player_id` text,
	`target_name` text DEFAULT '' NOT NULL,
	`reason` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	`resolved_by` text
);
--> statement-breakpoint
CREATE INDEX `reports_status_idx` ON `reports` (`status`);

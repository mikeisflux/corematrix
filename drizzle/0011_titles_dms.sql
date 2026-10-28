ALTER TABLE `users` ADD `title` text;--> statement-breakpoint
CREATE TABLE `dms` (
	`id` text PRIMARY KEY NOT NULL,
	`from_id` text NOT NULL,
	`from_name` text NOT NULL,
	`to_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer
);
--> statement-breakpoint
CREATE INDEX `dms_from_idx` ON `dms` (`from_id`);--> statement-breakpoint
CREATE INDEX `dms_to_idx` ON `dms` (`to_id`);

CREATE TABLE `user_items` (
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`via` text DEFAULT 'coins' NOT NULL,
	`acquired_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`)
);
--> statement-breakpoint
CREATE TABLE `sponsored_items` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`booth_id` integer NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`claims` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sponsored_ends_idx` ON `sponsored_items` (`ends_at`);

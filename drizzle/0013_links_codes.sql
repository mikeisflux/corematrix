ALTER TABLE `booths` ADD `artstation` text;--> statement-breakpoint
ALTER TABLE `booths` ADD `deviantart` text;--> statement-breakpoint
ALTER TABLE `booths` ADD `instagram` text;--> statement-breakpoint
ALTER TABLE `booths` ADD `x_url` text;--> statement-breakpoint
CREATE TABLE `booth_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`size` text NOT NULL,
	`label` text,
	`max_uses` integer DEFAULT 1 NOT NULL,
	`uses` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booth_codes_code_unique` ON `booth_codes` (`code`);--> statement-breakpoint
CREATE INDEX `booth_codes_label_idx` ON `booth_codes` (`label`);--> statement-breakpoint
CREATE TABLE `code_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`code_id` text NOT NULL,
	`user_id` text NOT NULL,
	`booth_id` integer NOT NULL,
	`tx_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `code_redemptions_code_idx` ON `code_redemptions` (`code_id`);

CREATE TABLE `booth_products` (
	`id` text PRIMARY KEY NOT NULL,
	`booth_id` integer NOT NULL,
	`title` text NOT NULL,
	`blurb` text,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`url` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `products_booth_idx` ON `booth_products` (`booth_id`,`sort`);

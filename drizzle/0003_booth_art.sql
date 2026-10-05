CREATE TABLE `booth_art` (
	`booth_id` integer NOT NULL,
	`slot` text NOT NULL,
	`mime` text NOT NULL,
	`data` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`booth_id`, `slot`)
);

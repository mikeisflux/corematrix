CREATE TABLE `quest_days` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`quest` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`claimed_at` integer,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `day`, `quest`)
);

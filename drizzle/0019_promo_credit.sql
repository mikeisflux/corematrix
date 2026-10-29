ALTER TABLE `users` ADD `promo_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `team_members` ADD `accepted_at` integer;--> statement-breakpoint
UPDATE `team_members` SET `accepted_at` = `created_at` WHERE `user_id` IS NOT NULL;

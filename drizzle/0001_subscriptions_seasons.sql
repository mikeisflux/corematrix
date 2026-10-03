ALTER TABLE `plots` ADD `subscription_id` text;--> statement-breakpoint
ALTER TABLE `plots` ADD `subscription_status` text;--> statement-breakpoint
ALTER TABLE `plots` ADD `featured_until` integer;--> statement-breakpoint
ALTER TABLE `plots` ADD `last_takeover_nudge_at` integer;--> statement-breakpoint
ALTER TABLE `seasons` ADD `closed_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `stripe_customer_id` text;
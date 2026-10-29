ALTER TABLE `users` ADD `email_verified_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `referral_paid_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `referral_tx_id` text;--> statement-breakpoint
ALTER TABLE `login_tokens` ADD `purpose` text DEFAULT 'reset' NOT NULL;--> statement-breakpoint
UPDATE `users` SET `email_verified_at` = `created_at` WHERE `is_admin` = 1;--> statement-breakpoint
UPDATE `users` SET `referral_paid_at` = `created_at` WHERE `referred_by` IS NOT NULL;

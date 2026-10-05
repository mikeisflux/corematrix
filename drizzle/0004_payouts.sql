CREATE TABLE `payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`method` text DEFAULT 'paypal' NOT NULL,
	`paypal_email` text NOT NULL,
	`legal_name` text NOT NULL,
	`address` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reference` text,
	`note` text,
	`admin_id` text,
	`created_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE INDEX `payouts_user_idx` ON `payouts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payouts_status_idx` ON `payouts` (`status`,`created_at`);
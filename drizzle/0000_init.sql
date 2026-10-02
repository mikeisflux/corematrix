CREATE TABLE `billboards` (
	`id` text PRIMARY KEY NOT NULL,
	`slot` text NOT NULL,
	`owner_id` text NOT NULL,
	`plot_id` integer,
	`headline` text NOT NULL,
	`body` text,
	`website` text,
	`image_url` text,
	`color` text DEFAULT '#111827' NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`seen` integer DEFAULT 0 NOT NULL,
	`opens` integer DEFAULT 0 NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `billboards_slot_idx` ON `billboards` (`slot`,`ends_at`);--> statement-breakpoint
CREATE TABLE `coin_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`ref` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `coin_user_idx` ON `coin_ledger` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`plot_id` integer,
	`title` text NOT NULL,
	`detail` text,
	`amount_cents` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_created_idx` ON `events` (`created_at`);--> statement-breakpoint
CREATE TABLE `game_plays` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`user_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `game_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`user_id` text NOT NULL,
	`player_name` text NOT NULL,
	`plot_id` integer,
	`score` integer NOT NULL,
	`day` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scores_game_idx` ON `game_scores` (`game_id`,`score`);--> statement-breakpoint
CREATE INDEX `scores_day_idx` ON `game_scores` (`game_id`,`day`,`score`);--> statement-breakpoint
CREATE TABLE `login_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`user_id` text NOT NULL,
	`author_name` text NOT NULL,
	`author_plot_id` integer,
	`body` text NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_room_idx` ON `messages` (`room`,`created_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`plot_id` integer,
	`read_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notif_user_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `plot_daily` (
	`plot_id` integer NOT NULL,
	`day` text NOT NULL,
	`impressions` integer DEFAULT 0 NOT NULL,
	`hovers` integer DEFAULT 0 NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`uniques` integer DEFAULT 0 NOT NULL,
	`conversions` integer DEFAULT 0 NOT NULL,
	`conversion_value_cents` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plot_daily_pk` ON `plot_daily` (`plot_id`,`day`);--> statement-breakpoint
CREATE TABLE `plot_referrers` (
	`plot_id` integer NOT NULL,
	`source` text NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plot_ref_pk` ON `plot_referrers` (`plot_id`,`source`);--> statement-breakpoint
CREATE TABLE `plots` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_id` text,
	`name` text,
	`tagline` text,
	`description` text,
	`website` text,
	`logo_url` text,
	`color` text DEFAULT '#5b8def' NOT NULL,
	`accent` text DEFAULT '#ffffff' NOT NULL,
	`style` text DEFAULT 'modern' NOT NULL,
	`shape` text DEFAULT 'tower' NOT NULL,
	`floors` integer DEFAULT 1 NOT NULL,
	`roof` text DEFAULT 'flat' NOT NULL,
	`district` text DEFAULT 'downtown' NOT NULL,
	`tier` text DEFAULT 'free' NOT NULL,
	`tier_until` integer,
	`value_cents` integer DEFAULT 0 NOT NULL,
	`claimed_at` integer,
	`updated_at` integer,
	`last_sold_at` integer,
	`hidden` integer DEFAULT false NOT NULL,
	`not_for_sale_until` integer,
	`total_views` integer DEFAULT 0 NOT NULL,
	`total_clicks` integer DEFAULT 0 NOT NULL,
	`total_impressions` integer DEFAULT 0 NOT NULL,
	`sales_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plots_owner_idx` ON `plots` (`owner_id`);--> statement-breakpoint
CREATE INDEX `plots_value_idx` ON `plots` (`value_cents`);--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`results_json` text
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_daily` (
	`day` text PRIMARY KEY NOT NULL,
	`visits` integer DEFAULT 0 NOT NULL,
	`uniques` integer DEFAULT 0 NOT NULL,
	`claims` integer DEFAULT 0 NOT NULL,
	`takeovers` integer DEFAULT 0 NOT NULL,
	`boosts` integer DEFAULT 0 NOT NULL,
	`revenue_cents` integer DEFAULT 0 NOT NULL,
	`signups` integer DEFAULT 0 NOT NULL,
	`outbound_clicks` integer DEFAULT 0 NOT NULL,
	`checkout_starts` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`plot_id` integer NOT NULL,
	`kind` text NOT NULL,
	`buyer_id` text,
	`seller_id` text,
	`amount_cents` integer NOT NULL,
	`seller_payout_cents` integer DEFAULT 0 NOT NULL,
	`platform_cents` integer DEFAULT 0 NOT NULL,
	`value_before` integer DEFAULT 0 NOT NULL,
	`value_after` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider` text DEFAULT 'sandbox' NOT NULL,
	`provider_ref` text,
	`meta` text,
	`created_at` integer NOT NULL,
	`paid_at` integer
);
--> statement-breakpoint
CREATE INDEX `tx_plot_idx` ON `transactions` (`plot_id`);--> statement-breakpoint
CREATE INDEX `tx_buyer_idx` ON `transactions` (`buyer_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`handle` text,
	`referral_code` text NOT NULL,
	`referred_by` text,
	`credit_cents` integer DEFAULT 0 NOT NULL,
	`coins` integer DEFAULT 0 NOT NULL,
	`last_daily_coins_at` integer,
	`streak` integer DEFAULT 0 NOT NULL,
	`notify_email` integer DEFAULT true NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_referral_code_unique` ON `users` (`referral_code`);--> statement-breakpoint
CREATE TABLE `visitor_seen` (
	`plot_id` integer NOT NULL,
	`day` text NOT NULL,
	`visitor` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visitor_seen_pk` ON `visitor_seen` (`plot_id`,`day`,`visitor`);
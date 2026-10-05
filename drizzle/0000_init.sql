CREATE TABLE `admin_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`admin_email` text,
	`action` text NOT NULL,
	`resource` text NOT NULL,
	`resource_id` text,
	`before` text,
	`after` text,
	`ip` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_admin_idx` ON `admin_audit_log` (`admin_id`);--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `admin_audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `billboards` (
	`id` text PRIMARY KEY NOT NULL,
	`slot` text NOT NULL,
	`owner_id` text NOT NULL,
	`booth_id` integer,
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
CREATE TABLE `booth_daily` (
	`booth_id` integer NOT NULL,
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
CREATE UNIQUE INDEX `booth_daily_pk` ON `booth_daily` (`booth_id`,`day`);--> statement-breakpoint
CREATE TABLE `booth_referrers` (
	`booth_id` integer NOT NULL,
	`source` text NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booth_ref_pk` ON `booth_referrers` (`booth_id`,`source`);--> statement-breakpoint
CREATE TABLE `booths` (
	`id` integer PRIMARY KEY NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`size` text DEFAULT '10x10' NOT NULL,
	`kind` text DEFAULT 'exhibitor' NOT NULL,
	`hall` text DEFAULT 'A' NOT NULL,
	`aisle` integer DEFAULT 100 NOT NULL,
	`owner_id` text,
	`name` text,
	`tagline` text,
	`description` text,
	`website` text,
	`logo_url` text,
	`color` text DEFAULT '#5b8def' NOT NULL,
	`accent` text DEFAULT '#ffffff' NOT NULL,
	`style` text DEFAULT 'classic' NOT NULL,
	`cloth` text DEFAULT '#111827' NOT NULL,
	`category` text DEFAULT 'comics' NOT NULL,
	`tier` text DEFAULT 'free' NOT NULL,
	`tier_until` integer,
	`subscription_id` text,
	`subscription_status` text,
	`featured_until` integer,
	`last_takeover_nudge_at` integer,
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
CREATE INDEX `booths_owner_idx` ON `booths` (`owner_id`);--> statement-breakpoint
CREATE INDEX `booths_value_idx` ON `booths` (`value_cents`);--> statement-breakpoint
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
CREATE TABLE `email_template_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`version` integer NOT NULL,
	`subject` text NOT NULL,
	`html` text NOT NULL,
	`text` text,
	`changed_by` text,
	`change_note` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tpl_ver_idx` ON `email_template_versions` (`template_id`,`version`);--> statement-breakpoint
CREATE TABLE `email_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`subject` text NOT NULL,
	`html` text NOT NULL,
	`text` text,
	`is_active` integer DEFAULT true NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_templates_slug_unique` ON `email_templates` (`slug`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`booth_id` integer,
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
	`booth_id` integer,
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
CREATE TABLE `mail_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`data` blob NOT NULL,
	`inline` integer DEFAULT false NOT NULL,
	`content_id` text
);
--> statement-breakpoint
CREATE INDEX `mail_att_msg_idx` ON `mail_attachments` (`message_id`);--> statement-breakpoint
CREATE TABLE `mail_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`direction` text NOT NULL,
	`channel` text DEFAULT 'email' NOT NULL,
	`from_email` text NOT NULL,
	`from_name` text,
	`to_email` text,
	`cc` text,
	`subject` text NOT NULL,
	`text` text,
	`html` text,
	`read` integer DEFAULT false NOT NULL,
	`starred` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`thread_id` text,
	`status` text,
	`status_message` text,
	`sendgrid_message_id` text,
	`template_slug` text,
	`user_id` text,
	`tx_id` text,
	`booth_id` integer,
	`headers` text,
	`events` text,
	`created_at` integer NOT NULL,
	`sent_at` integer
);
--> statement-breakpoint
CREATE INDEX `mail_dir_idx` ON `mail_messages` (`direction`,`archived`,`created_at`);--> statement-breakpoint
CREATE INDEX `mail_thread_idx` ON `mail_messages` (`thread_id`);--> statement-breakpoint
CREATE INDEX `mail_to_idx` ON `mail_messages` (`to_email`);--> statement-breakpoint
CREATE UNIQUE INDEX `mail_sg_idx` ON `mail_messages` (`sendgrid_message_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`user_id` text NOT NULL,
	`author_name` text NOT NULL,
	`author_booth_id` integer,
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
	`booth_id` integer,
	`read_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notif_user_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`closed_at` integer,
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
	`booth_id` integer NOT NULL,
	`kind` text NOT NULL,
	`buyer_id` text,
	`seller_id` text,
	`amount_cents` integer NOT NULL,
	`seller_payout_cents` integer DEFAULT 0 NOT NULL,
	`platform_cents` integer DEFAULT 0 NOT NULL,
	`value_before` integer DEFAULT 0 NOT NULL,
	`value_after` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider` text DEFAULT 'divinitycoin' NOT NULL,
	`provider_ref` text,
	`session_id` text,
	`customer_ip` text,
	`customer_user_agent` text,
	`refunded_cents` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`meta` text,
	`created_at` integer NOT NULL,
	`paid_at` integer
);
--> statement-breakpoint
CREATE INDEX `tx_booth_idx` ON `transactions` (`booth_id`);--> statement-breakpoint
CREATE INDEX `tx_buyer_idx` ON `transactions` (`buyer_id`);--> statement-breakpoint
CREATE INDEX `tx_session_idx` ON `transactions` (`session_id`);--> statement-breakpoint
CREATE INDEX `tx_status_idx` ON `transactions` (`status`,`created_at`);--> statement-breakpoint
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
	`stripe_customer_id` text,
	`dc_payment_method_id` text,
	`card_ip` text,
	`card_user_agent` text,
	`avatar` text,
	`is_admin` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_referral_code_unique` ON `users` (`referral_code`);--> statement-breakpoint
CREATE TABLE `visitor_seen` (
	`booth_id` integer NOT NULL,
	`day` text NOT NULL,
	`visitor` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visitor_seen_pk` ON `visitor_seen` (`booth_id`,`day`,`visitor`);--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`event_id` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`error` text,
	`received_at` integer NOT NULL,
	`processed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wh_provider_event_idx` ON `webhook_events` (`provider`,`event_id`);--> statement-breakpoint
CREATE INDEX `wh_received_idx` ON `webhook_events` (`provider`,`received_at`);
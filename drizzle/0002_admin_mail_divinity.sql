ALTER TABLE `transactions` ADD `session_id` text;
--> statement-breakpoint
ALTER TABLE `transactions` ADD `customer_ip` text;
--> statement-breakpoint
ALTER TABLE `transactions` ADD `customer_user_agent` text;
--> statement-breakpoint
ALTER TABLE `transactions` ADD `refunded_cents` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `transactions` ADD `notes` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `dc_payment_method_id` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `card_ip` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `card_user_agent` text;
--> statement-breakpoint
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
	`plot_id` integer,
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
CREATE INDEX `wh_received_idx` ON `webhook_events` (`provider`,`received_at`);--> statement-breakpoint
DROP INDEX IF EXISTS "audit_admin_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "audit_created_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "billboards_slot_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "coin_user_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "tpl_ver_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "email_templates_slug_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "events_created_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "scores_game_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "scores_day_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "mail_att_msg_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "mail_dir_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "mail_thread_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "mail_to_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "mail_sg_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "messages_room_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "notif_user_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "plot_daily_pk";--> statement-breakpoint
DROP INDEX IF EXISTS "plot_ref_pk";--> statement-breakpoint
DROP INDEX IF EXISTS "plots_owner_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "plots_value_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "tx_plot_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "tx_buyer_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "tx_session_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "tx_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "users_email_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "users_referral_code_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "visitor_seen_pk";--> statement-breakpoint
DROP INDEX IF EXISTS "wh_provider_event_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "wh_received_idx";--> statement-breakpoint
ALTER TABLE `transactions` ALTER COLUMN "provider" TO "provider" text NOT NULL DEFAULT 'divinitycoin';--> statement-breakpoint
CREATE INDEX `billboards_slot_idx` ON `billboards` (`slot`,`ends_at`);--> statement-breakpoint
CREATE INDEX `coin_user_idx` ON `coin_ledger` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `events_created_idx` ON `events` (`created_at`);--> statement-breakpoint
CREATE INDEX `scores_game_idx` ON `game_scores` (`game_id`,`score`);--> statement-breakpoint
CREATE INDEX `scores_day_idx` ON `game_scores` (`game_id`,`day`,`score`);--> statement-breakpoint
CREATE INDEX `messages_room_idx` ON `messages` (`room`,`created_at`);--> statement-breakpoint
CREATE INDEX `notif_user_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `plot_daily_pk` ON `plot_daily` (`plot_id`,`day`);--> statement-breakpoint
CREATE UNIQUE INDEX `plot_ref_pk` ON `plot_referrers` (`plot_id`,`source`);--> statement-breakpoint
CREATE INDEX `plots_owner_idx` ON `plots` (`owner_id`);--> statement-breakpoint
CREATE INDEX `plots_value_idx` ON `plots` (`value_cents`);--> statement-breakpoint
CREATE INDEX `tx_plot_idx` ON `transactions` (`plot_id`);--> statement-breakpoint
CREATE INDEX `tx_buyer_idx` ON `transactions` (`buyer_id`);--> statement-breakpoint
CREATE INDEX `tx_session_idx` ON `transactions` (`session_id`);--> statement-breakpoint
CREATE INDEX `tx_status_idx` ON `transactions` (`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_referral_code_unique` ON `users` (`referral_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `visitor_seen_pk` ON `visitor_seen` (`plot_id`,`day`,`visitor`);
CREATE TABLE "admin_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"admin_email" text,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" text,
	"before" text,
	"after" text,
	"ip" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billboards" (
	"id" text PRIMARY KEY NOT NULL,
	"slot" text NOT NULL,
	"owner_id" text NOT NULL,
	"booth_id" bigint,
	"headline" text NOT NULL,
	"body" text,
	"website" text,
	"image_url" text,
	"color" text DEFAULT '#111827' NOT NULL,
	"starts_at" bigint NOT NULL,
	"ends_at" bigint NOT NULL,
	"amount_cents" bigint NOT NULL,
	"seen" bigint DEFAULT 0 NOT NULL,
	"opens" bigint DEFAULT 0 NOT NULL,
	"clicks" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_player_id" text,
	"blocked_user_id" text,
	"blocked_player_id" text,
	"name" text DEFAULT '' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booth_art" (
	"booth_id" bigint NOT NULL,
	"slot" text NOT NULL,
	"mime" text NOT NULL,
	"data" text NOT NULL,
	"url" text,
	"link" text,
	"width" bigint NOT NULL,
	"height" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "booth_art_booth_id_slot_pk" PRIMARY KEY("booth_id","slot")
);
--> statement-breakpoint
CREATE TABLE "booth_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"size" text NOT NULL,
	"label" text,
	"max_uses" bigint DEFAULT 1 NOT NULL,
	"uses" bigint DEFAULT 0 NOT NULL,
	"expires_at" bigint,
	"created_by" text,
	"created_at" bigint NOT NULL,
	"revoked_at" bigint,
	CONSTRAINT "booth_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "booth_daily" (
	"booth_id" bigint NOT NULL,
	"day" text NOT NULL,
	"impressions" bigint DEFAULT 0 NOT NULL,
	"hovers" bigint DEFAULT 0 NOT NULL,
	"views" bigint DEFAULT 0 NOT NULL,
	"clicks" bigint DEFAULT 0 NOT NULL,
	"uniques" bigint DEFAULT 0 NOT NULL,
	"conversions" bigint DEFAULT 0 NOT NULL,
	"conversion_value_cents" bigint DEFAULT 0 NOT NULL,
	"dwell_seconds" bigint DEFAULT 0 NOT NULL,
	"banner_clicks" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booth_products" (
	"id" text PRIMARY KEY NOT NULL,
	"booth_id" bigint NOT NULL,
	"title" text NOT NULL,
	"blurb" text,
	"price_cents" bigint DEFAULT 0 NOT NULL,
	"url" text NOT NULL,
	"sort" bigint DEFAULT 0 NOT NULL,
	"clicks" bigint DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booth_referrers" (
	"booth_id" bigint NOT NULL,
	"source" text NOT NULL,
	"views" bigint DEFAULT 0 NOT NULL,
	"clicks" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booths" (
	"id" bigint PRIMARY KEY NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"size" text DEFAULT '10x10' NOT NULL,
	"kind" text DEFAULT 'exhibitor' NOT NULL,
	"hall" text DEFAULT 'A' NOT NULL,
	"aisle" bigint DEFAULT 100 NOT NULL,
	"owner_id" text,
	"name" text,
	"tagline" text,
	"description" text,
	"website" text,
	"artstation" text,
	"deviantart" text,
	"instagram" text,
	"x_url" text,
	"facebook" text,
	"globalcomix" text,
	"commissions" text,
	"commission_note" text,
	"logo_url" text,
	"color" text DEFAULT '#5b8def' NOT NULL,
	"accent" text DEFAULT '#ffffff' NOT NULL,
	"style" text DEFAULT 'classic' NOT NULL,
	"cloth" text DEFAULT '#111827' NOT NULL,
	"banner_height" bigint DEFAULT 6 NOT NULL,
	"book_slots" bigint DEFAULT 0 NOT NULL,
	"table_mode" text DEFAULT 'books' NOT NULL,
	"category" text DEFAULT 'comics' NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"tier_until" bigint,
	"subscription_id" text,
	"subscription_status" text,
	"featured_until" bigint,
	"last_takeover_nudge_at" bigint,
	"value_cents" bigint DEFAULT 0 NOT NULL,
	"free_value_cents" bigint DEFAULT 0 NOT NULL,
	"claimed_at" bigint,
	"updated_at" bigint,
	"last_sold_at" bigint,
	"hidden" boolean DEFAULT false NOT NULL,
	"not_for_sale_until" bigint,
	"total_views" bigint DEFAULT 0 NOT NULL,
	"total_clicks" bigint DEFAULT 0 NOT NULL,
	"total_impressions" bigint DEFAULT 0 NOT NULL,
	"sales_count" bigint DEFAULT 0 NOT NULL,
	"team_id" text
);
--> statement-breakpoint
CREATE TABLE "code_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"code_id" text NOT NULL,
	"user_id" text NOT NULL,
	"booth_id" bigint NOT NULL,
	"tx_id" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coin_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"delta" bigint NOT NULL,
	"reason" text NOT NULL,
	"ref" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dms" (
	"id" text PRIMARY KEY NOT NULL,
	"from_id" text NOT NULL,
	"from_name" text NOT NULL,
	"to_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" bigint NOT NULL,
	"read_at" bigint
);
--> statement-breakpoint
CREATE TABLE "email_template_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"version" bigint NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"text" text,
	"changed_by" text,
	"change_note" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"text" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "email_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"booth_id" bigint,
	"title" text NOT NULL,
	"detail" text,
	"amount_cents" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" text NOT NULL,
	"booth_id" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "favorites_user_id_booth_id_pk" PRIMARY KEY("user_id","booth_id")
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"id" text PRIMARY KEY NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" bigint NOT NULL,
	"accepted_at" bigint
);
--> statement-breakpoint
CREATE TABLE "game_plays" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"user_id" text NOT NULL,
	"started_at" bigint NOT NULL,
	"finished_at" bigint
);
--> statement-breakpoint
CREATE TABLE "game_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"user_id" text NOT NULL,
	"player_name" text NOT NULL,
	"booth_id" bigint,
	"score" bigint NOT NULL,
	"day" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"used_at" bigint,
	"purpose" text DEFAULT 'reset' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" bigint NOT NULL,
	"data" "bytea" NOT NULL,
	"inline" boolean DEFAULT false NOT NULL,
	"content_id" text
);
--> statement-breakpoint
CREATE TABLE "mail_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"direction" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text,
	"to_email" text,
	"cc" text,
	"subject" text NOT NULL,
	"text" text,
	"html" text,
	"read" boolean DEFAULT false NOT NULL,
	"starred" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"thread_id" text,
	"status" text,
	"status_message" text,
	"sendgrid_message_id" text,
	"template_slug" text,
	"user_id" text,
	"tx_id" text,
	"booth_id" bigint,
	"headers" text,
	"events" text,
	"created_at" bigint NOT NULL,
	"sent_at" bigint
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"room" text NOT NULL,
	"user_id" text NOT NULL,
	"author_name" text NOT NULL,
	"author_booth_id" bigint,
	"body" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"booth_id" bigint,
	"read_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"method" text DEFAULT 'paypal' NOT NULL,
	"paypal_email" text NOT NULL,
	"legal_name" text NOT NULL,
	"address" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reference" text,
	"note" text,
	"admin_id" text,
	"created_at" bigint NOT NULL,
	"resolved_at" bigint
);
--> statement-breakpoint
CREATE TABLE "perf_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"visitor_id" text NOT NULL,
	"user_id" text,
	"label" text,
	"url" text,
	"device" text NOT NULL,
	"summary" text NOT NULL,
	"samples" text NOT NULL,
	"started_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_days" (
	"user_id" text NOT NULL,
	"day" text NOT NULL,
	"quest" text NOT NULL,
	"progress" bigint DEFAULT 0 NOT NULL,
	"claimed_at" bigint,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "quest_days_user_id_day_quest_pk" PRIMARY KEY("user_id","day","quest")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_id" text NOT NULL,
	"target_user_id" text,
	"target_player_id" text,
	"target_name" text DEFAULT '' NOT NULL,
	"reason" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"context" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" bigint NOT NULL,
	"resolved_at" bigint,
	"resolved_by" text
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" text PRIMARY KEY NOT NULL,
	"starts_at" bigint NOT NULL,
	"ends_at" bigint NOT NULL,
	"closed_at" bigint,
	"results_json" text
);
--> statement-breakpoint
CREATE TABLE "sentinel_errors" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"where" text NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"url" text,
	"ua" text,
	"visitor_id" text,
	"user_id" text,
	"count" bigint DEFAULT 1 NOT NULL,
	"first_at" bigint NOT NULL,
	"last_at" bigint NOT NULL,
	"resolved_at" bigint
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_daily" (
	"day" text PRIMARY KEY NOT NULL,
	"visits" bigint DEFAULT 0 NOT NULL,
	"uniques" bigint DEFAULT 0 NOT NULL,
	"claims" bigint DEFAULT 0 NOT NULL,
	"takeovers" bigint DEFAULT 0 NOT NULL,
	"boosts" bigint DEFAULT 0 NOT NULL,
	"revenue_cents" bigint DEFAULT 0 NOT NULL,
	"signups" bigint DEFAULT 0 NOT NULL,
	"outbound_clicks" bigint DEFAULT 0 NOT NULL,
	"checkout_starts" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsored_items" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"booth_id" bigint NOT NULL,
	"starts_at" bigint NOT NULL,
	"ends_at" bigint NOT NULL,
	"claims" bigint DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"via" text DEFAULT 'friend' NOT NULL,
	"accepted_at" bigint,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theater_videos" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"src" text NOT NULL,
	"mime" text,
	"bytes" bigint DEFAULT 0 NOT NULL,
	"duration" double precision DEFAULT 0 NOT NULL,
	"position" bigint DEFAULT 0 NOT NULL,
	"enabled" bigint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"category" text DEFAULT 'movie' NOT NULL,
	"hls" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"booth_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"buyer_id" text,
	"seller_id" text,
	"amount_cents" bigint NOT NULL,
	"seller_payout_cents" bigint DEFAULT 0 NOT NULL,
	"platform_cents" bigint DEFAULT 0 NOT NULL,
	"value_before" bigint DEFAULT 0 NOT NULL,
	"value_after" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text DEFAULT 'divinitycoin' NOT NULL,
	"provider_ref" text,
	"session_id" text,
	"customer_ip" text,
	"customer_user_agent" text,
	"refunded_cents" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"meta" text,
	"created_at" bigint NOT NULL,
	"paid_at" bigint
);
--> statement-breakpoint
CREATE TABLE "user_items" (
	"user_id" text NOT NULL,
	"item_id" text NOT NULL,
	"via" text DEFAULT 'coins' NOT NULL,
	"acquired_at" bigint NOT NULL,
	CONSTRAINT "user_items_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"handle" text,
	"title" text,
	"referral_code" text NOT NULL,
	"referred_by" text,
	"credit_cents" bigint DEFAULT 0 NOT NULL,
	"promo_cents" bigint DEFAULT 0 NOT NULL,
	"coins" bigint DEFAULT 0 NOT NULL,
	"last_daily_coins_at" bigint,
	"streak" bigint DEFAULT 0 NOT NULL,
	"notify_email" boolean DEFAULT true NOT NULL,
	"stripe_customer_id" text,
	"dc_payment_method_id" text,
	"card_ip" text,
	"card_user_agent" text,
	"avatar" text,
	"password_hash" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"permissions" text,
	"created_at" bigint NOT NULL,
	"last_seen_at" bigint,
	"email_verified_at" bigint,
	"referral_paid_at" bigint,
	"referral_tx_id" text,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "visitor_seen" (
	"booth_id" bigint NOT NULL,
	"day" text NOT NULL,
	"visitor" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"error" text,
	"received_at" bigint NOT NULL,
	"processed_at" bigint
);
--> statement-breakpoint
CREATE INDEX "audit_admin_idx" ON "admin_audit_log" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "admin_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "billboards_slot_idx" ON "billboards" USING btree ("slot","ends_at");--> statement-breakpoint
CREATE INDEX "blocks_user_idx" ON "blocks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "blocks_blocked_user_idx" ON "blocks" USING btree ("blocked_user_id");--> statement-breakpoint
CREATE INDEX "blocks_blocked_player_idx" ON "blocks" USING btree ("blocked_player_id");--> statement-breakpoint
CREATE INDEX "booth_codes_label_idx" ON "booth_codes" USING btree ("label");--> statement-breakpoint
CREATE UNIQUE INDEX "booth_daily_pk" ON "booth_daily" USING btree ("booth_id","day");--> statement-breakpoint
CREATE INDEX "products_booth_idx" ON "booth_products" USING btree ("booth_id","sort");--> statement-breakpoint
CREATE UNIQUE INDEX "booth_ref_pk" ON "booth_referrers" USING btree ("booth_id","source");--> statement-breakpoint
CREATE INDEX "booths_owner_idx" ON "booths" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "booths_value_idx" ON "booths" USING btree ("value_cents");--> statement-breakpoint
CREATE INDEX "code_redemptions_code_idx" ON "code_redemptions" USING btree ("code_id");--> statement-breakpoint
CREATE INDEX "coin_user_idx" ON "coin_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "dms_from_idx" ON "dms" USING btree ("from_id");--> statement-breakpoint
CREATE INDEX "dms_to_idx" ON "dms" USING btree ("to_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tpl_ver_idx" ON "email_template_versions" USING btree ("template_id","version");--> statement-breakpoint
CREATE INDEX "events_created_idx" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "friendships_from_idx" ON "friendships" USING btree ("from_id");--> statement-breakpoint
CREATE INDEX "friendships_to_idx" ON "friendships" USING btree ("to_id");--> statement-breakpoint
CREATE INDEX "scores_game_idx" ON "game_scores" USING btree ("game_id","score");--> statement-breakpoint
CREATE INDEX "scores_day_idx" ON "game_scores" USING btree ("game_id","day","score");--> statement-breakpoint
CREATE INDEX "mail_att_msg_idx" ON "mail_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "mail_dir_idx" ON "mail_messages" USING btree ("direction","archived","created_at");--> statement-breakpoint
CREATE INDEX "mail_thread_idx" ON "mail_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "mail_to_idx" ON "mail_messages" USING btree ("to_email");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_sg_idx" ON "mail_messages" USING btree ("sendgrid_message_id");--> statement-breakpoint
CREATE INDEX "messages_room_idx" ON "messages" USING btree ("room","created_at");--> statement-breakpoint
CREATE INDEX "notif_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "payouts_user_idx" ON "payouts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "payouts_status_idx" ON "payouts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "perf_started_idx" ON "perf_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sentinel_last_idx" ON "sentinel_errors" USING btree ("last_at");--> statement-breakpoint
CREATE INDEX "sentinel_resolved_idx" ON "sentinel_errors" USING btree ("resolved_at");--> statement-breakpoint
CREATE INDEX "sponsored_ends_idx" ON "sponsored_items" USING btree ("ends_at");--> statement-breakpoint
CREATE INDEX "team_members_team_idx" ON "team_members" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_members_user_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_members_email_idx" ON "team_members" USING btree ("email");--> statement-breakpoint
CREATE INDEX "teams_owner_idx" ON "teams" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "tx_booth_idx" ON "transactions" USING btree ("booth_id");--> statement-breakpoint
CREATE INDEX "tx_buyer_idx" ON "transactions" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "tx_session_idx" ON "transactions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "tx_status_idx" ON "transactions" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "visitor_seen_pk" ON "visitor_seen" USING btree ("booth_id","day","visitor");--> statement-breakpoint
CREATE UNIQUE INDEX "wh_provider_event_idx" ON "webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "wh_received_idx" ON "webhook_events" USING btree ("provider","received_at");
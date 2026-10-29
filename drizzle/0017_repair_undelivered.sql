-- Coin packs and billboards paid while their delivery step was missing: deliver them once.
UPDATE `users` SET `coins` = `coins` + (
  SELECT COALESCE(SUM(CAST(json_extract(t.`meta`, '$.coins') AS INTEGER)), 0) FROM `transactions` t
  WHERE t.`buyer_id` = `users`.`id` AND t.`kind` = 'coins' AND t.`status` = 'paid' AND json_extract(t.`meta`, '$.coins') > 0
    AND NOT EXISTS (SELECT 1 FROM `coin_ledger` l WHERE l.`ref` = t.`id` AND l.`reason` = 'purchase')
) WHERE `id` IN (
  SELECT t.`buyer_id` FROM `transactions` t WHERE t.`kind` = 'coins' AND t.`status` = 'paid' AND json_extract(t.`meta`, '$.coins') > 0
    AND NOT EXISTS (SELECT 1 FROM `coin_ledger` l WHERE l.`ref` = t.`id` AND l.`reason` = 'purchase')
);--> statement-breakpoint
INSERT INTO `coin_ledger` (`id`, `user_id`, `delta`, `reason`, `ref`, `created_at`)
SELECT 'repair_' || t.`id`, t.`buyer_id`, CAST(json_extract(t.`meta`, '$.coins') AS INTEGER), 'purchase', t.`id`, CAST(strftime('%s','now') AS INTEGER) * 1000
FROM `transactions` t WHERE t.`kind` = 'coins' AND t.`status` = 'paid' AND t.`buyer_id` IS NOT NULL AND json_extract(t.`meta`, '$.coins') > 0
  AND NOT EXISTS (SELECT 1 FROM `coin_ledger` l WHERE l.`ref` = t.`id` AND l.`reason` = 'purchase');--> statement-breakpoint
INSERT INTO `billboards` (`id`, `slot`, `owner_id`, `booth_id`, `headline`, `body`, `website`, `image_url`, `color`, `starts_at`, `ends_at`, `amount_cents`, `status`, `created_at`)
SELECT t.`id`, json_extract(t.`meta`, '$.billboard.slot'), t.`buyer_id`, json_extract(t.`meta`, '$.billboard.boothId'), json_extract(t.`meta`, '$.billboard.headline'),
  json_extract(t.`meta`, '$.billboard.body'), json_extract(t.`meta`, '$.billboard.website'), json_extract(t.`meta`, '$.billboard.imageUrl'),
  COALESCE(json_extract(t.`meta`, '$.billboard.color'), '#111827'),
  MAX(CAST(strftime('%s','now') AS INTEGER) * 1000, json_extract(t.`meta`, '$.billboard.startsAt')),
  MAX(CAST(strftime('%s','now') AS INTEGER) * 1000, json_extract(t.`meta`, '$.billboard.startsAt')) + (json_extract(t.`meta`, '$.billboard.endsAt') - json_extract(t.`meta`, '$.billboard.startsAt')),
  t.`amount_cents`, 'active', CAST(strftime('%s','now') AS INTEGER) * 1000
FROM `transactions` t WHERE t.`kind` = 'billboard' AND t.`status` = 'paid' AND t.`buyer_id` IS NOT NULL AND json_extract(t.`meta`, '$.billboard.headline') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `billboards` b WHERE b.`owner_id` = t.`buyer_id` AND b.`headline` = json_extract(t.`meta`, '$.billboard.headline') AND b.`amount_cents` = t.`amount_cents`);

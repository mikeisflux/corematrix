ALTER TABLE `booths` ADD `free_value_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `booths` SET `free_value_cents` = MIN(`value_cents`, COALESCE((
  SELECT t.`value_after` FROM `code_redemptions` r JOIN `transactions` t ON t.`id` = r.`tx_id`
  WHERE r.`booth_id` = `booths`.`id` AND r.`user_id` = `booths`.`owner_id` ORDER BY r.`created_at` DESC LIMIT 1
), 0))
WHERE `owner_id` IS NOT NULL AND EXISTS (SELECT 1 FROM `code_redemptions` r WHERE r.`booth_id` = `booths`.`id` AND r.`user_id` = `booths`.`owner_id`)
  AND NOT EXISTS (SELECT 1 FROM `transactions` t2 WHERE t2.`booth_id` = `booths`.`id` AND t2.`kind` = 'takeover' AND t2.`status` = 'paid' AND t2.`buyer_id` = `booths`.`owner_id`);

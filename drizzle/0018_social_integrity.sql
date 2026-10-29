ALTER TABLE `team_members` ADD `via` text DEFAULT 'friend' NOT NULL;--> statement-breakpoint
UPDATE `sentinel_errors` SET `visitor_id` = NULL WHERE substr(`visitor_id`, 1, 2) = 'v_';--> statement-breakpoint
UPDATE `booths` SET `team_id` = NULL WHERE `team_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `teams` t WHERE t.`id` = `booths`.`team_id` AND t.`owner_id` = `booths`.`owner_id`);--> statement-breakpoint
DELETE FROM `friendships` WHERE `id` IN (
  SELECT f.`id` FROM `friendships` f WHERE EXISTS (
    SELECT 1 FROM `friendships` g WHERE g.`id` != f.`id`
      AND min(g.`from_id`, g.`to_id`) = min(f.`from_id`, f.`to_id`) AND max(g.`from_id`, g.`to_id`) = max(f.`from_id`, f.`to_id`)
      AND ((g.`status` = 'accepted' AND f.`status` != 'accepted') OR (g.`status` = f.`status` AND (g.`created_at` < f.`created_at` OR (g.`created_at` = f.`created_at` AND g.`id` < f.`id`))))
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `friendships_pair_unique` ON `friendships` (min(`from_id`, `to_id`), max(`from_id`, `to_id`));--> statement-breakpoint
DELETE FROM `team_members` WHERE `id` IN (
  SELECT m.`id` FROM `team_members` m WHERE EXISTS (
    SELECT 1 FROM `team_members` n WHERE n.`team_id` = m.`team_id` AND n.`email` = m.`email` AND n.`id` != m.`id` AND (n.`created_at` < m.`created_at` OR (n.`created_at` = m.`created_at` AND n.`id` < m.`id`))
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `team_members_team_email_unique` ON `team_members` (`team_id`, `email`);--> statement-breakpoint
UPDATE `users` SET `handle` = NULL WHERE `handle` IS NOT NULL AND trim(`handle`) = '';--> statement-breakpoint
UPDATE `users` SET `handle` = NULL WHERE `handle` IS NOT NULL AND EXISTS (
  SELECT 1 FROM `users` u2 WHERE u2.`id` != `users`.`id` AND lower(u2.`handle`) = lower(`users`.`handle`) AND (u2.`created_at` < `users`.`created_at` OR (u2.`created_at` = `users`.`created_at` AND u2.`id` < `users`.`id`))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_handle_unique` ON `users` (lower(`handle`)) WHERE `handle` IS NOT NULL;

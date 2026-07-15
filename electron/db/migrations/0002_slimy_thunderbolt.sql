ALTER TABLE `terminal_config` ADD `store_address` text;--> statement-breakpoint
ALTER TABLE `terminal_config` ADD `store_phone` text;--> statement-breakpoint
ALTER TABLE `terminal_config` ADD `store_email` text;--> statement-breakpoint
-- Seed the values receipt.ts used to hardcode, so an existing install's
-- printed receipts don't change (or go blank) the moment this migration
-- runs — Settings > Store info lets staff edit them from here on.
UPDATE `terminal_config` SET
  `store_address` = '19B Fola Osibo, Lekki 1
Lagos
10001',
  `store_phone` = '0701 824 9203',
  `store_email` = 'hello@gourmettwist.ng'
WHERE `id` = 'default' AND `store_address` IS NULL;
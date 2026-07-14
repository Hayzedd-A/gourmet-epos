CREATE TABLE `outbox` (
	`sale_id` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `payment_method_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text,
	`is_active` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`description` text,
	`price` real NOT NULL,
	`price_ex_tax` real NOT NULL,
	`variant_description` text,
	`source` text NOT NULL,
	`remote_id` text,
	`zupa_product_id` text,
	`is_available` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sale` (
	`id` text PRIMARY KEY NOT NULL,
	`shift_id` text NOT NULL,
	`staff_id` text NOT NULL,
	`store_id` text NOT NULL,
	`terminal_id` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`subtotal` real NOT NULL,
	`discount_value` real DEFAULT 0 NOT NULL,
	`tax_value` real DEFAULT 0 NOT NULL,
	`total` real NOT NULL,
	`payment_method_id` text,
	`payment_method_label` text,
	`transaction_ref` text,
	`match_status` text DEFAULT 'unmatched' NOT NULL,
	`matched_at` integer,
	`opened_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`label` text,
	`sold_at` integer,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`server_order_id` text,
	`void_reason` text
);
--> statement-breakpoint
CREATE TABLE `sale_item` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name_at_sale` text NOT NULL,
	`unit_price_at_sale` real NOT NULL,
	`quantity` integer NOT NULL,
	`line_total` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shift` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`terminal_id` text NOT NULL,
	`opened_at` integer NOT NULL,
	`closed_at` integer
);
--> statement-breakpoint
CREATE TABLE `staff_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`pin_hash` text,
	`access_role` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_meta` (
	`resource` text PRIMARY KEY NOT NULL,
	`last_synced_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `terminal_config` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`terminal_id` text NOT NULL,
	`device_secret` text NOT NULL,
	`api_key` text,
	`store_id` text,
	`jwt` text,
	`theme` text DEFAULT 'light' NOT NULL
);

-- Easy CMS migration 20260925091723_init
-- Generated from the config; review before deploying.
CREATE TABLE `ecms_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`email` text,
	`name` text,
	`role` text,
	`active` integer,
	`password_hash` text
);

--> statement-breakpoint
CREATE INDEX `ecms_users_created_at_idx` ON `ecms_users` (`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecms_users_email_unique` ON `ecms_users` (`email`);
--> statement-breakpoint
CREATE TABLE `ecms_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`name` text,
	`slug` text
);

--> statement-breakpoint
CREATE INDEX `ecms_categories_created_at_idx` ON `ecms_categories` (`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecms_categories_slug_unique` ON `ecms_categories` (`slug`);
--> statement-breakpoint
CREATE TABLE `ecms_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`title` text,
	`slug` text,
	`excerpt` text,
	`body` text,
	`category` integer,
	`author` integer,
	`published_at` text
);

--> statement-breakpoint
CREATE INDEX `ecms_posts_created_at_idx` ON `ecms_posts` (`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecms_posts_slug_unique` ON `ecms_posts` (`slug`);
--> statement-breakpoint
CREATE INDEX `ecms_posts_category_idx` ON `ecms_posts` (`category`);
--> statement-breakpoint
CREATE INDEX `ecms_posts_author_idx` ON `ecms_posts` (`author`);
--> statement-breakpoint
CREATE TABLE `ecms_posts__tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`_parent_id` integer NOT NULL,
	`_order` integer NOT NULL,
	`value` text
);

--> statement-breakpoint
CREATE INDEX `ecms_posts__tags__parent_id_idx` ON `ecms_posts__tags` (`_parent_id`);
--> statement-breakpoint
CREATE INDEX `ecms_posts__tags_value_idx` ON `ecms_posts__tags` (`value`);
--> statement-breakpoint
CREATE TABLE `ecms_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`token_hash` text,
	`user` integer,
	`expires_at` text
);

--> statement-breakpoint
CREATE INDEX `ecms_sessions_created_at_idx` ON `ecms_sessions` (`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecms_sessions_token_hash_unique` ON `ecms_sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `ecms_sessions_user_idx` ON `ecms_sessions` (`user`);
--> statement-breakpoint
CREATE INDEX `ecms_sessions_expires_at_idx` ON `ecms_sessions` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `ecms_login_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`key` text
);

--> statement-breakpoint
CREATE INDEX `ecms_login_attempts_created_at_idx` ON `ecms_login_attempts` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ecms_login_attempts_key_idx` ON `ecms_login_attempts` (`key`);
--> statement-breakpoint
CREATE TABLE `ecms_globals` (
	`slug` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`status` text,
	`updated_at` text NOT NULL
);


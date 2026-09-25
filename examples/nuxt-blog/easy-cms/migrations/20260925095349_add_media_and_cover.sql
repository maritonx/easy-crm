-- Easy CMS migration 20260925095349_add_media_and_cover
-- Generated from the config; review before deploying.
CREATE TABLE `ecms_media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`filename` text,
	`original_name` text,
	`mime_type` text,
	`filesize` real,
	`width` real,
	`height` real,
	`sizes` text,
	`alt` text
);

--> statement-breakpoint
CREATE INDEX `ecms_media_created_at_idx` ON `ecms_media` (`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecms_media_filename_unique` ON `ecms_media` (`filename`);
--> statement-breakpoint
ALTER TABLE `ecms_posts` ADD `cover` integer;
--> statement-breakpoint
CREATE INDEX `ecms_posts_cover_idx` ON `ecms_posts` (`cover`);

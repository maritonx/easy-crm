-- Easy CMS migration 20260925101618_init (postgres)
-- Generated from the config; review before deploying.
CREATE TABLE "ecms_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"email" text,
	"name" text,
	"role" text,
	"active" boolean,
	"password_hash" text
);

--> statement-breakpoint
CREATE TABLE "ecms_media" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"filename" text,
	"original_name" text,
	"mime_type" text,
	"filesize" double precision,
	"width" double precision,
	"height" double precision,
	"sizes" jsonb,
	"alt" text
);

--> statement-breakpoint
CREATE TABLE "ecms_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"name" text,
	"slug" text
);

--> statement-breakpoint
CREATE TABLE "ecms_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text,
	"slug" text,
	"excerpt" text,
	"cover" integer,
	"body" jsonb,
	"category" integer,
	"author" integer,
	"published_at" text
);

--> statement-breakpoint
CREATE TABLE "ecms_posts__tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"_parent_id" integer NOT NULL,
	"_order" integer NOT NULL,
	"value" text
);

--> statement-breakpoint
CREATE TABLE "ecms_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"token_hash" text,
	"user" integer,
	"expires_at" text
);

--> statement-breakpoint
CREATE TABLE "ecms_login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"key" text
);

--> statement-breakpoint
CREATE TABLE "ecms_globals" (
	"slug" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"status" text,
	"updated_at" text NOT NULL
);

--> statement-breakpoint
CREATE INDEX "ecms_users_created_at_idx" ON "ecms_users" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ecms_users_email_unique" ON "ecms_users" USING btree ("email");
--> statement-breakpoint
CREATE INDEX "ecms_media_created_at_idx" ON "ecms_media" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ecms_media_filename_unique" ON "ecms_media" USING btree ("filename");
--> statement-breakpoint
CREATE INDEX "ecms_categories_created_at_idx" ON "ecms_categories" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ecms_categories_slug_unique" ON "ecms_categories" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "ecms_posts_created_at_idx" ON "ecms_posts" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ecms_posts_slug_unique" ON "ecms_posts" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "ecms_posts_cover_idx" ON "ecms_posts" USING btree ("cover");
--> statement-breakpoint
CREATE INDEX "ecms_posts_category_idx" ON "ecms_posts" USING btree ("category");
--> statement-breakpoint
CREATE INDEX "ecms_posts_author_idx" ON "ecms_posts" USING btree ("author");
--> statement-breakpoint
CREATE INDEX "ecms_posts__tags__parent_id_idx" ON "ecms_posts__tags" USING btree ("_parent_id");
--> statement-breakpoint
CREATE INDEX "ecms_posts__tags_value_idx" ON "ecms_posts__tags" USING btree ("value");
--> statement-breakpoint
CREATE INDEX "ecms_sessions_created_at_idx" ON "ecms_sessions" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "ecms_sessions_token_hash_unique" ON "ecms_sessions" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "ecms_sessions_user_idx" ON "ecms_sessions" USING btree ("user");
--> statement-breakpoint
CREATE INDEX "ecms_sessions_expires_at_idx" ON "ecms_sessions" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX "ecms_login_attempts_created_at_idx" ON "ecms_login_attempts" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "ecms_login_attempts_key_idx" ON "ecms_login_attempts" USING btree ("key");

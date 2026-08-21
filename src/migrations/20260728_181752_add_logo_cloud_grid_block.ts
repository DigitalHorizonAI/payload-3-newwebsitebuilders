import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Adds the Logo Cloud Grid block tables (PR #6) and syncs schema drift accumulated
// from Payload 3.x upgrades since the last generated migration (users_sessions,
// payload_kv, forms select placeholder, unique redirects index).
// Intentionally idempotent so fresh installs and existing installs both succeed:
// users_sessions and forms_blocks_select.placeholder are already created by the
// 20260222_003500_payload_3_77_compat migration.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE IF NOT EXISTS "pages_blocks_logo_cloud_grid_logos" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"logo_id" integer,
  	"name" varchar,
  	"href" varchar
  );

  CREATE TABLE IF NOT EXISTS "pages_blocks_logo_cloud_grid" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"block_name" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_blocks_logo_cloud_grid_logos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"logo_id" integer,
  	"name" varchar,
  	"href" varchar,
  	"_uuid" varchar
  );

  CREATE TABLE IF NOT EXISTS "_pages_v_blocks_logo_cloud_grid" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );

  CREATE TABLE IF NOT EXISTS "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );

  DROP INDEX IF EXISTS "redirects_from_idx";
  ALTER TABLE "forms_emails" ALTER COLUMN "subject" SET DEFAULT 'You''ve received a new message.';
  ALTER TABLE "forms_blocks_select" ADD COLUMN IF NOT EXISTS "placeholder" varchar;

  DO $$ BEGIN
    ALTER TABLE "pages_blocks_logo_cloud_grid_logos" ADD CONSTRAINT "pages_blocks_logo_cloud_grid_logos_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  DO $$ BEGIN
    ALTER TABLE "pages_blocks_logo_cloud_grid_logos" ADD CONSTRAINT "pages_blocks_logo_cloud_grid_logos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_logo_cloud_grid"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  DO $$ BEGIN
    ALTER TABLE "pages_blocks_logo_cloud_grid" ADD CONSTRAINT "pages_blocks_logo_cloud_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  DO $$ BEGIN
    ALTER TABLE "_pages_v_blocks_logo_cloud_grid_logos" ADD CONSTRAINT "_pages_v_blocks_logo_cloud_grid_logos_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  DO $$ BEGIN
    ALTER TABLE "_pages_v_blocks_logo_cloud_grid_logos" ADD CONSTRAINT "_pages_v_blocks_logo_cloud_grid_logos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_logo_cloud_grid"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  DO $$ BEGIN
    ALTER TABLE "_pages_v_blocks_logo_cloud_grid" ADD CONSTRAINT "_pages_v_blocks_logo_cloud_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  DO $$ BEGIN
    ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE INDEX IF NOT EXISTS "pages_blocks_logo_cloud_grid_logos_order_idx" ON "pages_blocks_logo_cloud_grid_logos" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_blocks_logo_cloud_grid_logos_parent_id_idx" ON "pages_blocks_logo_cloud_grid_logos" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_logo_cloud_grid_logos_logo_idx" ON "pages_blocks_logo_cloud_grid_logos" USING btree ("logo_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_logo_cloud_grid_order_idx" ON "pages_blocks_logo_cloud_grid" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "pages_blocks_logo_cloud_grid_parent_id_idx" ON "pages_blocks_logo_cloud_grid" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "pages_blocks_logo_cloud_grid_path_idx" ON "pages_blocks_logo_cloud_grid" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_logo_cloud_grid_logos_order_idx" ON "_pages_v_blocks_logo_cloud_grid_logos" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_logo_cloud_grid_logos_parent_id_idx" ON "_pages_v_blocks_logo_cloud_grid_logos" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_logo_cloud_grid_logos_logo_idx" ON "_pages_v_blocks_logo_cloud_grid_logos" USING btree ("logo_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_logo_cloud_grid_order_idx" ON "_pages_v_blocks_logo_cloud_grid" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_logo_cloud_grid_parent_id_idx" ON "_pages_v_blocks_logo_cloud_grid" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_blocks_logo_cloud_grid_path_idx" ON "_pages_v_blocks_logo_cloud_grid" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE UNIQUE INDEX IF NOT EXISTS "redirects_from_idx" ON "redirects" USING btree ("from");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE IF EXISTS "pages_blocks_logo_cloud_grid_logos" CASCADE;
  DROP TABLE IF EXISTS "pages_blocks_logo_cloud_grid" CASCADE;
  DROP TABLE IF EXISTS "_pages_v_blocks_logo_cloud_grid_logos" CASCADE;
  DROP TABLE IF EXISTS "_pages_v_blocks_logo_cloud_grid" CASCADE;
  DROP TABLE IF EXISTS "users_sessions" CASCADE;
  DROP TABLE IF EXISTS "payload_kv" CASCADE;
  DROP INDEX IF EXISTS "redirects_from_idx";
  ALTER TABLE "forms_emails" ALTER COLUMN "subject" SET DEFAULT 'You''ve received a new message.';
  CREATE INDEX IF NOT EXISTS "redirects_from_idx" ON "redirects" USING btree ("from");
  ALTER TABLE "forms_blocks_select" DROP COLUMN IF EXISTS "placeholder";`)
}

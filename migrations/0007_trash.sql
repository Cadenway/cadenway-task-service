CREATE TABLE "trash_entries" (
	"organization_id" uuid NOT NULL,
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"root_task_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"parent_key" text,
	"task_count" integer NOT NULL,
	"trashed_at" timestamp (3) with time zone NOT NULL,
	"trashed_by_type" text NOT NULL,
	"trashed_by_id" text NOT NULL,
	"purge_requested_at" timestamp (3) with time zone,
	"purge_requested_by_type" text,
	"purge_requested_by_id" text,
	CONSTRAINT "trash_entries_pkey" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "trash_entries_parent_key_check" CHECK ("trash_entries"."parent_key" is null or "trash_entries"."parent_key" ~ '^[A-Z]{2,5}-[1-9][0-9]{0,8}$'),
	CONSTRAINT "trash_entries_task_count_check" CHECK ("trash_entries"."task_count" >= 1),
	CONSTRAINT "trash_entries_trashed_by_type_check" CHECK ("trash_entries"."trashed_by_type" in ('user', 'automation', 'git', 'system')),
	CONSTRAINT "trash_entries_trashed_by_id_check" CHECK ("trash_entries"."trashed_by_id" <> ''),
	CONSTRAINT "trash_entries_purge_requested_check" CHECK (("trash_entries"."purge_requested_at" is null) = ("trash_entries"."purge_requested_by_type" is null) and ("trash_entries"."purge_requested_at" is null) = ("trash_entries"."purge_requested_by_id" is null)),
	CONSTRAINT "trash_entries_purge_requested_by_type_check" CHECK ("trash_entries"."purge_requested_by_type" is null or "trash_entries"."purge_requested_by_type" in ('user', 'automation', 'git', 'system')),
	CONSTRAINT "trash_entries_purge_requested_by_id_check" CHECK ("trash_entries"."purge_requested_by_id" is null or "trash_entries"."purge_requested_by_id" <> '')
);
--> statement-breakpoint
ALTER TABLE "trash_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "space_prefixes" DROP CONSTRAINT "space_prefixes_space_fkey";
--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "deleted_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "deleted_by_type" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "deleted_by_id" text;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "deleted_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "deleted_by_type" text;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "deleted_by_id" text;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "restored_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "trash_entry_id" uuid;--> statement-breakpoint
CREATE INDEX "trash_entries_trashed_index" ON "trash_entries" USING btree ("organization_id","trashed_at","id") WHERE "trash_entries"."purge_requested_at" is null;--> statement-breakpoint
CREATE INDEX "trash_entries_purge_requested_index" ON "trash_entries" USING btree ("organization_id","purge_requested_at","id") WHERE "trash_entries"."purge_requested_at" is not null;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_trash_entry_fkey" FOREIGN KEY ("organization_id","trash_entry_id") REFERENCES "public"."trash_entries"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "list_grants_space_index" ON "list_grants" USING btree ("organization_id","space_id");--> statement-breakpoint
CREATE INDEX "tasks_trash_entry_index" ON "tasks" USING btree ("organization_id","trash_entry_id") WHERE "tasks"."trash_entry_id" is not null;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_deleted_check" CHECK (("lists"."deleted_at" is null) = ("lists"."deleted_by_type" is null) and ("lists"."deleted_at" is null) = ("lists"."deleted_by_id" is null));--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_deleted_by_type_check" CHECK ("lists"."deleted_by_type" is null or "lists"."deleted_by_type" in ('user', 'automation', 'git', 'system'));--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_deleted_by_id_check" CHECK ("lists"."deleted_by_id" is null or "lists"."deleted_by_id" <> '');--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_deleted_check" CHECK (("spaces"."deleted_at" is null) = ("spaces"."deleted_by_type" is null) and ("spaces"."deleted_at" is null) = ("spaces"."deleted_by_id" is null));--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_deleted_by_type_check" CHECK ("spaces"."deleted_by_type" is null or "spaces"."deleted_by_type" in ('user', 'automation', 'git', 'system'));--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_deleted_by_id_check" CHECK ("spaces"."deleted_by_id" is null or "spaces"."deleted_by_id" <> '');--> statement-breakpoint
CREATE POLICY "trash_entries_organization_isolation" ON "trash_entries" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
-- Added by hand: drizzle-kit enables row-level security but does not force it, and without FORCE
-- the owner of the tables (the migrator role) would bypass their policies.
ALTER TABLE "trash_entries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- Added by hand: drizzle-kit cannot declare extended statistics. Without them the planner takes
-- `list_id = any($lists)` of the trash page for a few rows of the organization (the statistics of
-- `list_id` cover every organization) and sorts a bitmap scan of every entry instead of walking
-- `trash_entries_trashed_index` (tests/trash-queries.int-spec.ts: 59,747 against 259 buffers).
CREATE STATISTICS "trash_entries_list_statistics" (dependencies, ndistinct, mcv) ON "organization_id", "list_id" FROM "trash_entries";

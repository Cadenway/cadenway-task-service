ALTER TABLE "lists" ADD COLUMN "archived_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "archived_by_type" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "archived_by_id" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "restored_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "archived_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "archived_by_type" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "archived_by_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "archive_root_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "archive_root" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_archive_root_fkey" FOREIGN KEY ("organization_id","archive_root_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lists_organization_archived_index" ON "lists" USING btree ("organization_id","archived_at","id") WHERE "lists"."archived_at" is not null;--> statement-breakpoint
CREATE INDEX "tasks_archive_root_index" ON "tasks" USING btree ("organization_id","archived_at","id") WHERE "tasks"."archive_root";--> statement-breakpoint
CREATE INDEX "tasks_archive_member_index" ON "tasks" USING btree ("organization_id","archive_root_id") WHERE "tasks"."archive_root_id" is not null;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_archived_check" CHECK (("lists"."archived_at" is null) = ("lists"."archived_by_type" is null) and ("lists"."archived_at" is null) = ("lists"."archived_by_id" is null));--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_archived_by_type_check" CHECK ("lists"."archived_by_type" is null or "lists"."archived_by_type" in ('user', 'automation', 'git', 'system'));--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_archived_by_id_check" CHECK ("lists"."archived_by_id" is null or "lists"."archived_by_id" <> '');--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_archived_check" CHECK (("tasks"."archived_at" is null) = ("tasks"."archived_by_type" is null) and ("tasks"."archived_at" is null) = ("tasks"."archived_by_id" is null) and ("tasks"."archived_at" is null) = ("tasks"."archive_root_id" is null));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_archive_root_check" CHECK ("tasks"."archive_root" = coalesce("tasks"."archive_root_id" = "tasks"."id", false));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_archived_by_type_check" CHECK ("tasks"."archived_by_type" is null or "tasks"."archived_by_type" in ('user', 'automation', 'git', 'system'));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_archived_by_id_check" CHECK ("tasks"."archived_by_id" is null or "tasks"."archived_by_id" <> '');
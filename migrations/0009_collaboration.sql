CREATE TABLE "task_comments" (
	"organization_id" uuid NOT NULL,
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"task_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"body" text,
	"mentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reply_to_comment_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp (3) with time zone,
	"deleted_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "task_comments_pkey" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "task_comments_actor_type_check" CHECK ("task_comments"."actor_type" in ('user', 'automation', 'git', 'system')),
	CONSTRAINT "task_comments_actor_id_check" CHECK ("task_comments"."actor_id" <> ''),
	CONSTRAINT "task_comments_version_check" CHECK ("task_comments"."version" >= 1),
	CONSTRAINT "task_comments_tombstone_check" CHECK (("task_comments"."deleted_at" is null) = ("task_comments"."body" is not null)),
	CONSTRAINT "task_comments_deleted_mentions_check" CHECK ("task_comments"."deleted_at" is null or "task_comments"."mentions" = '[]'::jsonb)
);
--> statement-breakpoint
ALTER TABLE "task_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_watcher_overrides" (
	"organization_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"following" boolean NOT NULL,
	CONSTRAINT "task_watcher_overrides_pkey" PRIMARY KEY("organization_id","task_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "task_watcher_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_entries" DROP CONSTRAINT "activity_entries_kind_check";--> statement-breakpoint
ALTER TABLE "activity_entries" ADD COLUMN "comment_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_entries" ADD COLUMN "comment_excerpt" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "description_mentions" jsonb;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_fkey" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_watcher_overrides" ADD CONSTRAINT "task_watcher_overrides_task_fkey" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_comments_task_created_index" ON "task_comments" USING btree ("organization_id","task_id","created_at","id");--> statement-breakpoint
CREATE INDEX "task_watcher_overrides_user_index" ON "task_watcher_overrides" USING btree ("organization_id","user_id","task_id");--> statement-breakpoint
ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_kind_check" CHECK ("activity_entries"."kind" in ('create', 'status', 'priority', 'due', 'assign', 'comment'));--> statement-breakpoint
CREATE POLICY "task_comments_organization_isolation" ON "task_comments" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "task_watcher_overrides_organization_isolation" ON "task_watcher_overrides" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');
--> statement-breakpoint
-- Drizzle enables but does not force tenant row-level security.
ALTER TABLE "task_comments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_watcher_overrides" FORCE ROW LEVEL SECURITY;

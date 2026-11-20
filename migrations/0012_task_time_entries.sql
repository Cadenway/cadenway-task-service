CREATE TABLE "task_time_entries" (
	"organization_id" uuid NOT NULL,
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"task_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"minutes" integer NOT NULL,
	"work_date" date NOT NULL,
	"note" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_time_entries_pkey" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "task_time_entries_minutes_check" CHECK ("task_time_entries"."minutes" between 1 and 1440),
	CONSTRAINT "task_time_entries_note_check" CHECK ("task_time_entries"."note" is null or (length("task_time_entries"."note") between 1 and 500 and "task_time_entries"."note" = btrim("task_time_entries"."note")))
);
--> statement-breakpoint
ALTER TABLE "task_time_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_time_entries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_entries" ADD COLUMN "initial_status" text;--> statement-breakpoint
ALTER TABLE "task_time_entries" ADD CONSTRAINT "task_time_entries_task_fkey" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_time_entries_task_created_index" ON "task_time_entries" USING btree ("organization_id","task_id","created_at","id");--> statement-breakpoint
-- The new column is null on every existing row. Enforce the check on writes without scanning the activity table under the ALTER TABLE lock.
ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_initial_status_check" CHECK ("activity_entries"."initial_status" is null or ("activity_entries"."kind" = 'create' and "activity_entries"."initial_status" in ('triage', 'backlog', 'todo', 'progress', 'review', 'testing', 'waiting', 'blocked', 'done', 'cancelled'))) NOT VALID;--> statement-breakpoint
CREATE POLICY "task_time_entries_organization_isolation" ON "task_time_entries" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');

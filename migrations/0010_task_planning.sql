CREATE TABLE "task_dependencies" (
	"organization_id" uuid NOT NULL,
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"blocker_task_id" uuid NOT NULL,
	"blocked_task_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_dependencies_pkey" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "task_dependencies_pair_unique" UNIQUE("organization_id","blocker_task_id","blocked_task_id"),
	CONSTRAINT "task_dependencies_distinct_check" CHECK ("task_dependencies"."blocker_task_id" <> "task_dependencies"."blocked_task_id")
);
--> statement-breakpoint
ALTER TABLE "task_dependencies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_dependencies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "milestone" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "recurrence" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "monthly_anchor_day" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "next_occurrence_key" text;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_blocker_fkey" FOREIGN KEY ("organization_id","blocker_task_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_blocked_fkey" FOREIGN KEY ("organization_id","blocked_task_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_dependencies_blocker_created_index" ON "task_dependencies" USING btree ("organization_id","blocker_task_id","created_at","id");--> statement-breakpoint
CREATE INDEX "task_dependencies_blocked_created_index" ON "task_dependencies" USING btree ("organization_id","blocked_task_id","created_at","id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recurrence_check" CHECK ("tasks"."recurrence" in ('none', 'daily', 'weekly', 'biweekly', 'monthly'));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_monthly_anchor_day_check" CHECK ("tasks"."monthly_anchor_day" is null or "tasks"."monthly_anchor_day" between 1 and 31);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_next_occurrence_key_check" CHECK ("tasks"."next_occurrence_key" is null or "tasks"."next_occurrence_key" ~ '^[A-Z]{2,5}-[1-9][0-9]{0,8}$');--> statement-breakpoint
CREATE POLICY "task_dependencies_organization_isolation" ON "task_dependencies" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');

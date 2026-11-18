CREATE TABLE "activity_entries" (
	"organization_id" uuid NOT NULL,
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"task_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"occurred_at" timestamp (3) with time zone NOT NULL,
	"status_from" text,
	"status_to" text,
	"priority_from" text,
	"priority_to" text,
	"due_from" date,
	"due_to" date,
	"assignee_user_id" uuid,
	"assignee_added" boolean,
	CONSTRAINT "activity_entries_pkey" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "activity_entries_kind_check" CHECK ("activity_entries"."kind" in ('create', 'status', 'priority', 'due', 'assign')),
	CONSTRAINT "activity_entries_actor_type_check" CHECK ("activity_entries"."actor_type" in ('user', 'automation', 'git', 'system')),
	CONSTRAINT "activity_entries_actor_id_check" CHECK ("activity_entries"."actor_id" <> ''),
	CONSTRAINT "activity_entries_status_check" CHECK (("activity_entries"."kind" = 'status') = ("activity_entries"."status_from" is not null) and ("activity_entries"."kind" = 'status') = ("activity_entries"."status_to" is not null) and ("activity_entries"."status_from" is null or "activity_entries"."status_from" in ('triage', 'backlog', 'todo', 'progress', 'review', 'testing', 'waiting', 'blocked', 'done', 'cancelled')) and ("activity_entries"."status_to" is null or "activity_entries"."status_to" in ('triage', 'backlog', 'todo', 'progress', 'review', 'testing', 'waiting', 'blocked', 'done', 'cancelled'))),
	CONSTRAINT "activity_entries_priority_check" CHECK (("activity_entries"."kind" = 'priority') = ("activity_entries"."priority_from" is not null) and ("activity_entries"."kind" = 'priority') = ("activity_entries"."priority_to" is not null) and ("activity_entries"."priority_from" is null or "activity_entries"."priority_from" in ('urgente', 'haute', 'moyenne', 'basse')) and ("activity_entries"."priority_to" is null or "activity_entries"."priority_to" in ('urgente', 'haute', 'moyenne', 'basse'))),
	CONSTRAINT "activity_entries_due_check" CHECK (case when "activity_entries"."kind" = 'due' then "activity_entries"."due_from" is not null or "activity_entries"."due_to" is not null else "activity_entries"."due_from" is null and "activity_entries"."due_to" is null end),
	CONSTRAINT "activity_entries_assignee_check" CHECK (("activity_entries"."kind" = 'assign') = ("activity_entries"."assignee_user_id" is not null) and ("activity_entries"."kind" = 'assign') = ("activity_entries"."assignee_added" is not null))
);
--> statement-breakpoint
ALTER TABLE "activity_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"organization_id" uuid NOT NULL,
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"task_id" uuid NOT NULL,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checklist_items_pkey" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "checklist_items_task_position_unique" UNIQUE("organization_id","task_id","position"),
	CONSTRAINT "checklist_items_position_check" CHECK ("checklist_items"."position" >= 0),
	CONSTRAINT "checklist_items_text_check" CHECK ("checklist_items"."text" <> '')
);
--> statement-breakpoint
ALTER TABLE "checklist_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_assignees" (
	"organization_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_assignees_pkey" PRIMARY KEY("organization_id","task_id","user_id"),
	CONSTRAINT "task_assignees_position_check" CHECK ("task_assignees"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "task_assignees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_labels" (
	"organization_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"label_key" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "task_labels_pkey" PRIMARY KEY("organization_id","task_id","label_key"),
	CONSTRAINT "task_labels_position_check" CHECK ("task_labels"."position" >= 0),
	CONSTRAINT "task_labels_name_check" CHECK ("task_labels"."name" <> '')
);
--> statement-breakpoint
ALTER TABLE "task_labels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tasks" (
	"organization_id" uuid NOT NULL,
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"key_prefix" text NOT NULL,
	"key_number" integer NOT NULL,
	"space_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"status" text NOT NULL,
	"cancel_reason" text,
	"cancel_note" text,
	"priority" text NOT NULL,
	"due_date" date,
	"start_date" date,
	"estimate_minutes" integer,
	"completed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by_type" text NOT NULL,
	"created_by_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "tasks_pkey" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "tasks_key_unique" UNIQUE("organization_id","key_prefix","key_number"),
	CONSTRAINT "tasks_key_prefix_check" CHECK ("tasks"."key_prefix" ~ '^[A-Z]{2,5}$'),
	CONSTRAINT "tasks_key_number_check" CHECK ("tasks"."key_number" between 1 and 999999999),
	CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" in ('triage', 'backlog', 'todo', 'progress', 'review', 'testing', 'waiting', 'blocked', 'done', 'cancelled')),
	CONSTRAINT "tasks_priority_check" CHECK ("tasks"."priority" in ('urgente', 'haute', 'moyenne', 'basse')),
	CONSTRAINT "tasks_cancel_reason_check" CHECK ("tasks"."cancel_reason" is null or "tasks"."cancel_reason" in ('duplicate', 'wontdo', 'scope', 'obsolete')),
	CONSTRAINT "tasks_cancelled_check" CHECK (("tasks"."status" = 'cancelled') = ("tasks"."cancel_reason" is not null)),
	CONSTRAINT "tasks_cancel_note_check" CHECK ("tasks"."cancel_note" is null or "tasks"."status" = 'cancelled'),
	CONSTRAINT "tasks_completed_check" CHECK (("tasks"."status" = 'done') = ("tasks"."completed_at" is not null)),
	CONSTRAINT "tasks_schedule_check" CHECK ("tasks"."start_date" is null or ("tasks"."due_date" is not null and "tasks"."start_date" <= "tasks"."due_date")),
	CONSTRAINT "tasks_estimate_check" CHECK ("tasks"."estimate_minutes" is null or "tasks"."estimate_minutes" between 1 and 60000),
	CONSTRAINT "tasks_created_by_type_check" CHECK ("tasks"."created_by_type" in ('user', 'automation', 'git', 'system')),
	CONSTRAINT "tasks_created_by_id_check" CHECK ("tasks"."created_by_id" <> ''),
	CONSTRAINT "tasks_parent_check" CHECK ("tasks"."parent_id" is null or "tasks"."parent_id" <> "tasks"."id"),
	CONSTRAINT "tasks_version_check" CHECK ("tasks"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_task_fkey" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_task_fkey" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_fkey" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_task_fkey" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_fkey" FOREIGN KEY ("organization_id","parent_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_entries_task_index" ON "activity_entries" USING btree ("organization_id","task_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "activity_entries_list_index" ON "activity_entries" USING btree ("organization_id","list_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "task_assignees_user_index" ON "task_assignees" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "tasks_parent_created_index" ON "tasks" USING btree ("organization_id","parent_id","created_at","id");--> statement-breakpoint
CREATE POLICY "activity_entries_organization_isolation" ON "activity_entries" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "checklist_items_organization_isolation" ON "checklist_items" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "task_assignees_organization_isolation" ON "task_assignees" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "task_labels_organization_isolation" ON "task_labels" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "tasks_organization_isolation" ON "tasks" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
-- Added by hand: drizzle-kit enables row-level security but does not force it, and without FORCE
-- the owner of the tables (the migrator role) would bypass their policies.
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_assignees" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_labels" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "checklist_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_entries" FORCE ROW LEVEL SECURITY;

CREATE TABLE "favorites" (
	"organization_id" uuid NOT NULL,
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT clock_timestamp() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_pkey" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "favorites_kind_check" CHECK ("favorites"."kind" in ('space', 'list', 'saved-view')),
	CONSTRAINT "favorites_version_check" CHECK ("favorites"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "favorites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "favorites" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "saved_views" (
	"organization_id" uuid NOT NULL,
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"list_id" uuid NOT NULL,
	"position" bigint NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"configuration" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "saved_views_pkey" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "saved_views_position_check" CHECK ("saved_views"."position" > 0),
	CONSTRAINT "saved_views_version_check" CHECK ("saved_views"."version" > 0),
	CONSTRAINT "saved_views_name_check" CHECK (char_length("saved_views"."name") between 1 and 80 and "saved_views"."name" ~ '[^[:space:]]')
);
--> statement-breakpoint
ALTER TABLE "saved_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "saved_views" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_templates" (
	"organization_id" uuid NOT NULL,
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"priority" text NOT NULL,
	"labels" jsonb NOT NULL,
	"checklist" jsonb NOT NULL,
	"subtasks" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "task_templates_pkey" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "task_templates_name_check" CHECK (length("task_templates"."name") between 1 and 80 and "task_templates"."name" ~ '\S'),
	CONSTRAINT "task_templates_title_check" CHECK ("task_templates"."title" <> ''),
	CONSTRAINT "task_templates_priority_check" CHECK ("task_templates"."priority" in ('urgente', 'haute', 'moyenne', 'basse')),
	CONSTRAINT "task_templates_labels_check" CHECK (jsonb_typeof("task_templates"."labels") = 'array'),
	CONSTRAINT "task_templates_checklist_check" CHECK (jsonb_typeof("task_templates"."checklist") = 'array'),
	CONSTRAINT "task_templates_subtasks_check" CHECK (jsonb_typeof("task_templates"."subtasks") = 'array'),
	CONSTRAINT "task_templates_version_check" CHECK ("task_templates"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "task_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_templates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_owner_target_unique" ON "favorites" USING btree ("organization_id","user_id","kind","target_id");--> statement-breakpoint
CREATE INDEX "favorites_owner_creation_index" ON "favorites" USING btree ("organization_id","user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "favorites_target_index" ON "favorites" USING btree ("organization_id","kind","target_id");--> statement-breakpoint
CREATE INDEX "saved_views_list_order_index" ON "saved_views" USING btree ("organization_id","list_id","position","id");--> statement-breakpoint
CREATE INDEX "task_templates_space_created_index" ON "task_templates" USING btree ("organization_id","space_id","created_at","id");--> statement-breakpoint
CREATE POLICY "favorites_organization_isolation" ON "favorites" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "saved_views_organization_isolation" ON "saved_views" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "task_templates_organization_isolation" ON "task_templates" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');

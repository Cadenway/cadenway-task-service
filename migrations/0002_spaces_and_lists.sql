CREATE TABLE "lists" (
	"organization_id" uuid NOT NULL,
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"color" text NOT NULL,
	"sprint_start_date" date,
	"sprint_end_date" date,
	"sprint_goal" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "lists_pkey" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "lists_sprint_dates_check" CHECK (("lists"."sprint_start_date" is null) = ("lists"."sprint_end_date" is null)),
	CONSTRAINT "lists_sprint_period_check" CHECK ("lists"."sprint_end_date" is null or "lists"."sprint_end_date" >= "lists"."sprint_start_date"),
	CONSTRAINT "lists_sprint_goal_check" CHECK ("lists"."sprint_goal" is null or "lists"."sprint_start_date" is not null),
	CONSTRAINT "lists_version_check" CHECK ("lists"."version" >= 1),
	CONSTRAINT "lists_icon_check" CHECK ("lists"."icon" is null or "lists"."icon" in ('rocket', 'paint', 'megaphone', 'gear', 'code', 'bug', 'lightning', 'target', 'flag', 'briefcase', 'chart', 'users', 'book', 'cube', 'headset', 'globe', 'star')),
	CONSTRAINT "lists_color_check" CHECK ("lists"."color" in ('gris', 'violet', 'indigo', 'azur', 'lagon', 'vert', 'olive', 'jaune', 'orange', 'rouge', 'rose', 'fuchsia', 'ardoise'))
);
--> statement-breakpoint
ALTER TABLE "lists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "space_prefixes" (
	"organization_id" uuid NOT NULL,
	"prefix" text NOT NULL,
	"space_id" uuid NOT NULL,
	"last_number" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_prefixes_pkey" PRIMARY KEY("organization_id","prefix"),
	CONSTRAINT "space_prefixes_prefix_check" CHECK ("space_prefixes"."prefix" ~ '^[A-Z]{2,5}$'),
	CONSTRAINT "space_prefixes_last_number_check" CHECK ("space_prefixes"."last_number" >= 0)
);
--> statement-breakpoint
ALTER TABLE "space_prefixes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "spaces" (
	"organization_id" uuid NOT NULL,
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"description" text,
	"icon" text,
	"color" text NOT NULL,
	"visibility" text NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"awaiting_owner" boolean DEFAULT false NOT NULL,
	"statuses" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "spaces_pkey" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "spaces_visibility_check" CHECK ("spaces"."visibility" in ('organization', 'private')),
	CONSTRAINT "spaces_prefix_check" CHECK ("spaces"."prefix" ~ '^[A-Z]{2,5}$'),
	CONSTRAINT "spaces_version_check" CHECK ("spaces"."version" >= 1),
	CONSTRAINT "spaces_awaiting_owner_check" CHECK (not "spaces"."awaiting_owner" or "spaces"."visibility" = 'private'),
	CONSTRAINT "spaces_icon_check" CHECK ("spaces"."icon" is null or "spaces"."icon" in ('rocket', 'paint', 'megaphone', 'gear', 'code', 'bug', 'lightning', 'target', 'flag', 'briefcase', 'chart', 'users', 'book', 'cube', 'headset', 'globe', 'star')),
	CONSTRAINT "spaces_color_check" CHECK ("spaces"."color" in ('gris', 'violet', 'indigo', 'azur', 'lagon', 'vert', 'olive', 'jaune', 'orange', 'rouge', 'rose', 'fuchsia', 'ardoise'))
);
--> statement-breakpoint
ALTER TABLE "spaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_space_fkey" FOREIGN KEY ("organization_id","space_id") REFERENCES "public"."spaces"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_prefixes" ADD CONSTRAINT "space_prefixes_space_fkey" FOREIGN KEY ("organization_id","space_id") REFERENCES "public"."spaces"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lists_organization_space_created_index" ON "lists" USING btree ("organization_id","space_id","created_at","id");--> statement-breakpoint
CREATE INDEX "spaces_organization_created_index" ON "spaces" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "spaces_organization_owner_index" ON "spaces" USING btree ("organization_id","owner_user_id");--> statement-breakpoint
CREATE POLICY "lists_organization_isolation" ON "lists" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "space_prefixes_organization_isolation" ON "space_prefixes" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "spaces_organization_isolation" ON "spaces" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
-- Added by hand: drizzle-kit enables row-level security but does not force it, and without FORCE
-- the owner of the tables (the migrator role) would bypass their policies.
ALTER TABLE "spaces" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "space_prefixes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lists" FORCE ROW LEVEL SECURITY;

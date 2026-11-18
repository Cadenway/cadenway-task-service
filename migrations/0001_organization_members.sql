CREATE TABLE "organization_members" (
	"organization_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"version" bigint NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_members_pkey" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "organization_members_role_check" CHECK ("organization_members"."role" in ('owner', 'admin', 'member', 'guest')),
	CONSTRAINT "organization_members_version_check" CHECK ("organization_members"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "organization_members_organization_user_index" ON "organization_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE POLICY "organization_members_organization_isolation" ON "organization_members" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
-- Added by hand: drizzle-kit enables row-level security but does not force it, and without FORCE
-- the owner of the table (the migrator role) would bypass its policy.
ALTER TABLE "organization_members" FORCE ROW LEVEL SECURITY;

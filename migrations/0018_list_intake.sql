CREATE TABLE "intake_contacts" (
	"organization_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intake_contacts_pkey" PRIMARY KEY("organization_id","task_id")
);
--> statement-breakpoint
ALTER TABLE "intake_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "intake_forms" (
	"organization_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"fields" jsonb NOT NULL,
	"default_status" text NOT NULL,
	"default_assignee_id" uuid,
	"public_key" text,
	"version" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intake_forms_pkey" PRIMARY KEY("organization_id","list_id"),
	CONSTRAINT "intake_forms_version_check" CHECK ("intake_forms"."version" >= 1),
	CONSTRAINT "intake_forms_title_check" CHECK (length("intake_forms"."title") between 1 and 300),
	CONSTRAINT "intake_forms_fields_check" CHECK (jsonb_typeof("intake_forms"."fields") = 'object')
);
--> statement-breakpoint
ALTER TABLE "intake_forms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "intake_publications" (
	"organization_id" uuid NOT NULL,
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"list_id" uuid,
	"key_digest" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intake_publications_pkey" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "intake_publications_key_digest_check" CHECK ("intake_publications"."key_digest" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "intake_publications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "intake_submissions" (
	"organization_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"key_digest" text NOT NULL,
	"fingerprint" text NOT NULL,
	"receipt" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intake_submissions_pkey" PRIMARY KEY("organization_id","publication_id","key_digest"),
	CONSTRAINT "intake_submissions_key_digest_check" CHECK ("intake_submissions"."key_digest" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "intake_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "intake_submissions" ADD CONSTRAINT "intake_submissions_publication_fkey" FOREIGN KEY ("organization_id","publication_id") REFERENCES "public"."intake_publications"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "intake_publications_key_digest_unique" ON "intake_publications" USING btree ("key_digest");--> statement-breakpoint
CREATE INDEX "intake_submissions_expiry_index" ON "intake_submissions" USING btree ("created_at","organization_id","publication_id","key_digest");--> statement-breakpoint
CREATE POLICY "intake_contacts_organization_isolation" ON "intake_contacts" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "intake_forms_organization_isolation" ON "intake_forms" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "intake_publications_organization_isolation" ON "intake_publications" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "intake_submissions_organization_isolation" ON "intake_submissions" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
ALTER TABLE "intake_contacts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "intake_forms" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "intake_publications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "intake_submissions" FORCE ROW LEVEL SECURITY;

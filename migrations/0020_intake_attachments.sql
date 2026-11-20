CREATE TABLE "intake_attachment_drafts" (
	"organization_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"draft_digest" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"closed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intake_attachment_drafts_pkey" PRIMARY KEY("organization_id","publication_id","draft_digest"),
	CONSTRAINT "intake_attachment_drafts_digest_check" CHECK ("intake_attachment_drafts"."draft_digest" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "intake_attachment_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "intake_attachment_reservations" (
	"organization_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"draft_digest" text NOT NULL,
	"attachment_id" uuid DEFAULT uuidv7() NOT NULL,
	"request_key_digest" text NOT NULL,
	"declaration" jsonb NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"status" text NOT NULL,
	"task_key" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intake_attachment_reservations_pkey" PRIMARY KEY("organization_id","attachment_id"),
	CONSTRAINT "intake_attachment_reservations_key_check" CHECK ("intake_attachment_reservations"."request_key_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "intake_attachment_reservations_declaration_check" CHECK (jsonb_typeof("intake_attachment_reservations"."declaration") = 'object'),
	CONSTRAINT "intake_attachment_reservations_status_check" CHECK ("intake_attachment_reservations"."status" in ('reserved', 'verified', 'claimed', 'released')),
	CONSTRAINT "intake_attachment_reservations_task_check" CHECK (("intake_attachment_reservations"."status" = 'claimed') = ("intake_attachment_reservations"."task_key" is not null))
);
--> statement-breakpoint
ALTER TABLE "intake_attachment_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "intake_attachment_drafts" ADD CONSTRAINT "intake_attachment_drafts_publication_fkey" FOREIGN KEY ("organization_id","publication_id") REFERENCES "public"."intake_publications"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_attachment_reservations" ADD CONSTRAINT "intake_attachment_reservations_draft_fkey" FOREIGN KEY ("organization_id","publication_id","draft_digest") REFERENCES "public"."intake_attachment_drafts"("organization_id","publication_id","draft_digest") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "intake_attachment_reservations_request_unique" ON "intake_attachment_reservations" USING btree ("organization_id","publication_id","draft_digest","request_key_digest");--> statement-breakpoint
CREATE INDEX "intake_attachment_reservations_active_draft_index" ON "intake_attachment_reservations" USING btree ("organization_id","publication_id","draft_digest","attachment_id") WHERE "intake_attachment_reservations"."status" in ('reserved', 'verified');--> statement-breakpoint
CREATE POLICY "intake_attachment_drafts_organization_isolation" ON "intake_attachment_drafts" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "intake_attachment_reservations_organization_isolation" ON "intake_attachment_reservations" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
ALTER TABLE "intake_attachment_drafts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "intake_attachment_reservations" FORCE ROW LEVEL SECURITY;

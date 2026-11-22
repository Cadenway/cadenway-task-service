CREATE TABLE "task_bulk_receipt_scopes" (
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"receipt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"list_ids" uuid[] NOT NULL,
	CONSTRAINT "task_bulk_receipt_scopes_pkey" PRIMARY KEY("organization_id","key"),
	CONSTRAINT "task_bulk_receipt_scopes_list_ids_check" CHECK (cardinality("task_bulk_receipt_scopes"."list_ids") between 1 and 51)
);
--> statement-breakpoint
ALTER TABLE "task_bulk_receipt_scopes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_bulk_receipt_scopes" ADD CONSTRAINT "task_bulk_receipt_scopes_receipt_fkey" FOREIGN KEY ("organization_id","key") REFERENCES "public"."idempotency_keys"("organization_id","key") ON DELETE cascade ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE POLICY "task_bulk_receipt_scopes_organization_isolation" ON "task_bulk_receipt_scopes" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
ALTER TABLE "task_bulk_receipt_scopes" FORCE ROW LEVEL SECURITY;

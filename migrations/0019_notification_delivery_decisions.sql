CREATE TABLE "notification_delivery_authorization_decisions" (
	"organization_id" uuid NOT NULL,
	"authorization_request_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_value" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"decision" text NOT NULL,
	"decided_at" timestamp (3) with time zone NOT NULL,
	"valid_until" timestamp (3) with time zone NOT NULL,
	"event_id" uuid NOT NULL,
	"event_version" integer NOT NULL,
	CONSTRAINT "notification_delivery_authorization_decisions_organization_id_authorization_request_id_pk" PRIMARY KEY("organization_id","authorization_request_id"),
	CONSTRAINT "notification_delivery_decisions_subject_kind_check" CHECK ("notification_delivery_authorization_decisions"."subject_kind" in ('task-id', 'task-key')),
	CONSTRAINT "notification_delivery_decisions_subject_value_check" CHECK (length("notification_delivery_authorization_decisions"."subject_value") > 0),
	CONSTRAINT "notification_delivery_decisions_decision_check" CHECK ("notification_delivery_authorization_decisions"."decision" in ('permit', 'deny')),
	CONSTRAINT "notification_delivery_decisions_event_version_check" CHECK ("notification_delivery_authorization_decisions"."event_version" = 1),
	CONSTRAINT "notification_delivery_decisions_expiry_check" CHECK ("notification_delivery_authorization_decisions"."valid_until" <= "notification_delivery_authorization_decisions"."expires_at")
);
--> statement-breakpoint
ALTER TABLE "notification_delivery_authorization_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_delivery_authorization_decisions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notification_delivery_decisions_organization_isolation" ON "notification_delivery_authorization_decisions" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');

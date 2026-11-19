CREATE TABLE "access_request_attempts" (
	"organization_id" uuid NOT NULL,
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"attempted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_request_attempts_pkey" PRIMARY KEY("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "access_request_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "access_requests" (
	"organization_id" uuid NOT NULL,
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"target" text NOT NULL,
	"target_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"list_id" uuid,
	"task_id" uuid,
	"task_key" text,
	"requester_user_id" uuid NOT NULL,
	"message" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"role" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp (3) with time zone,
	"decided_by_type" text,
	"decided_by_id" text,
	CONSTRAINT "access_requests_pkey" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "access_requests_target_check" CHECK ("access_requests"."target" in ('space', 'list', 'task')),
	CONSTRAINT "access_requests_target_shape_check" CHECK (("access_requests"."target" = 'space' and "access_requests"."target_id" = "access_requests"."space_id" and "access_requests"."list_id" is null and "access_requests"."task_id" is null and "access_requests"."task_key" is null)
        or ("access_requests"."target" = 'list' and "access_requests"."target_id" = "access_requests"."list_id" and "access_requests"."task_id" is null and "access_requests"."task_key" is null)
        or ("access_requests"."target" = 'task' and "access_requests"."target_id" = "access_requests"."task_id" and "access_requests"."list_id" is not null and "access_requests"."task_key" ~ '^[A-Z]{2,5}-[1-9][0-9]{0,8}$')),
	CONSTRAINT "access_requests_state_check" CHECK ("access_requests"."state" in ('pending', 'approved', 'refused')),
	CONSTRAINT "access_requests_role_check" CHECK (("access_requests"."state" = 'approved') = ("access_requests"."role" is not null) and ("access_requests"."role" is null or "access_requests"."role" in ('edit', 'comment', 'view'))),
	CONSTRAINT "access_requests_decision_check" CHECK (("access_requests"."state" = 'pending') = ("access_requests"."decided_at" is null)
        and ("access_requests"."decided_at" is null) = ("access_requests"."decided_by_type" is null)
        and ("access_requests"."decided_at" is null) = ("access_requests"."decided_by_id" is null)
        and ("access_requests"."decided_by_type" is null or "access_requests"."decided_by_type" in ('user', 'automation', 'git', 'system')))
);
--> statement-breakpoint
ALTER TABLE "access_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "list_grants" (
	"organization_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"granted_by_type" text NOT NULL,
	"granted_by_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"granted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_grants_pkey" PRIMARY KEY("organization_id","list_id","user_id"),
	CONSTRAINT "list_grants_role_check" CHECK ("list_grants"."role" in ('edit', 'comment', 'view')),
	CONSTRAINT "list_grants_granted_by_type_check" CHECK ("list_grants"."granted_by_type" in ('user', 'automation', 'git', 'system'))
);
--> statement-breakpoint
ALTER TABLE "list_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "space_grants" (
	"organization_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"granted_by_type" text NOT NULL,
	"granted_by_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"granted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_grants_pkey" PRIMARY KEY("organization_id","space_id","user_id"),
	CONSTRAINT "space_grants_role_check" CHECK ("space_grants"."role" in ('edit', 'comment', 'view')),
	CONSTRAINT "space_grants_granted_by_type_check" CHECK ("space_grants"."granted_by_type" in ('user', 'automation', 'git', 'system'))
);
--> statement-breakpoint
ALTER TABLE "space_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "organization_access" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "list_grants" ADD CONSTRAINT "list_grants_list_fkey" FOREIGN KEY ("organization_id","list_id") REFERENCES "public"."lists"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_grants" ADD CONSTRAINT "list_grants_space_fkey" FOREIGN KEY ("organization_id","space_id") REFERENCES "public"."spaces"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_grants" ADD CONSTRAINT "space_grants_space_fkey" FOREIGN KEY ("organization_id","space_id") REFERENCES "public"."spaces"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_request_attempts_user_index" ON "access_request_attempts" USING btree ("organization_id","user_id","attempted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "access_requests_pending_unique" ON "access_requests" USING btree ("organization_id","requester_user_id","target","target_id") WHERE "access_requests"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "access_requests_pending_index" ON "access_requests" USING btree ("organization_id","created_at","id") WHERE "access_requests"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "list_grants_user_index" ON "list_grants" USING btree ("organization_id","user_id","space_id","list_id");--> statement-breakpoint
CREATE INDEX "space_grants_user_index" ON "space_grants" USING btree ("organization_id","user_id","space_id");--> statement-breakpoint
CREATE POLICY "access_request_attempts_organization_isolation" ON "access_request_attempts" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "access_requests_organization_isolation" ON "access_requests" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "list_grants_organization_isolation" ON "list_grants" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "space_grants_organization_isolation" ON "space_grants" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
-- Added by hand: drizzle-kit enables row-level security but does not force it, and without FORCE
-- the owner of the tables (the migrator role) would bypass their policies.
ALTER TABLE "space_grants" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "list_grants" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "access_requests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "access_request_attempts" FORCE ROW LEVEL SECURITY;

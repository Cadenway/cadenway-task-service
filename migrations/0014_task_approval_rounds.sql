CREATE TABLE "task_approval_reviewers" (
	"organization_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"decision" text,
	"decided_at" timestamp (3) with time zone,
	"comment_id" uuid,
	CONSTRAINT "task_approval_reviewers_pkey" PRIMARY KEY("organization_id","round_id","reviewer_user_id"),
	CONSTRAINT "task_approval_reviewers_position_unique" UNIQUE("organization_id","round_id","position"),
	CONSTRAINT "task_approval_reviewers_position_check" CHECK ("task_approval_reviewers"."position" between 0 and 19),
	CONSTRAINT "task_approval_reviewers_vote_check" CHECK (("task_approval_reviewers"."decision" is null and "task_approval_reviewers"."decided_at" is null and "task_approval_reviewers"."comment_id" is null)
        or ("task_approval_reviewers"."decision" is not distinct from 'approved' and "task_approval_reviewers"."decided_at" is not null and "task_approval_reviewers"."comment_id" is null)
        or ("task_approval_reviewers"."decision" is not distinct from 'changes-requested' and "task_approval_reviewers"."decided_at" is not null and "task_approval_reviewers"."comment_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "task_approval_reviewers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_approval_reviewers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_approval_rounds" (
	"organization_id" uuid NOT NULL,
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"task_id" uuid NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"requested_at" timestamp (3) with time zone NOT NULL,
	"closed_at" timestamp (3) with time zone,
	CONSTRAINT "task_approval_rounds_pkey" PRIMARY KEY("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "task_approval_rounds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_approval_rounds" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_approval_reviewers" ADD CONSTRAINT "task_approval_reviewers_round_fkey" FOREIGN KEY ("organization_id","round_id") REFERENCES "public"."task_approval_rounds"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_approval_rounds" ADD CONSTRAINT "task_approval_rounds_task_fkey" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_approval_rounds_current_unique" ON "task_approval_rounds" USING btree ("organization_id","task_id") WHERE "task_approval_rounds"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "task_approval_rounds_task_index" ON "task_approval_rounds" USING btree ("organization_id","task_id");--> statement-breakpoint
CREATE POLICY "task_approval_reviewers_organization_isolation" ON "task_approval_reviewers" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "task_approval_rounds_organization_isolation" ON "task_approval_rounds" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');

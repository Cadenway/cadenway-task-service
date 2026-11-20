CREATE TABLE "goals" (
	"organization_id" uuid NOT NULL,
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"quarter" text NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"space_id" uuid,
	"due_date" date NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_pkey" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "goals_version_check" CHECK ("goals"."version" > 0),
	CONSTRAINT "goals_quarter_check" CHECK ("goals"."quarter" ~ '^[0-9]{4}-Q[1-4]$' and left("goals"."quarter", 4) <> '0000'),
	CONSTRAINT "goals_name_check" CHECK (char_length("goals"."name") between 1 and 300 and "goals"."name" ~ '[^[:space:]]'),
	CONSTRAINT "goals_results_check" CHECK (jsonb_typeof("goals"."results") = 'array' and jsonb_array_length("goals"."results") <= 20)
);
--> statement-breakpoint
ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "goals" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "goals_organization_quarter_created_index" ON "goals" USING btree ("organization_id","quarter","created_at","id");--> statement-breakpoint
CREATE POLICY "goals_organization_isolation" ON "goals" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');

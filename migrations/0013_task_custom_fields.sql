CREATE TABLE "space_custom_fields" (
	"organization_id" uuid NOT NULL,
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"position" integer NOT NULL,
	"sprint_points" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp (3) with time zone,
	CONSTRAINT "space_custom_fields_pkey" PRIMARY KEY("organization_id","id"),
	CONSTRAINT "space_custom_fields_type_check" CHECK ("space_custom_fields"."type" in ('number', 'text')),
	CONSTRAINT "space_custom_fields_position_check" CHECK ("space_custom_fields"."position" between 0 and 29),
	CONSTRAINT "space_custom_fields_version_check" CHECK ("space_custom_fields"."version" >= 1),
	CONSTRAINT "space_custom_fields_name_check" CHECK (char_length("space_custom_fields"."name") between 1 and 80 and "space_custom_fields"."name" ~ '[^[:space:]]'),
	CONSTRAINT "space_custom_fields_sprint_points_check" CHECK (not "space_custom_fields"."sprint_points" or ("space_custom_fields"."type" = 'number' and "space_custom_fields"."retired_at" is null))
);
--> statement-breakpoint
ALTER TABLE "space_custom_fields" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "space_custom_fields" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_custom_field_values" (
	"organization_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"number_value" double precision,
	"text_value" text,
	CONSTRAINT "task_custom_field_values_pkey" PRIMARY KEY("organization_id","task_id","field_id"),
	CONSTRAINT "task_custom_field_values_one_value_check" CHECK (("task_custom_field_values"."number_value" is null) <> ("task_custom_field_values"."text_value" is null)),
	CONSTRAINT "task_custom_field_values_number_check" CHECK ("task_custom_field_values"."number_value" is null or ("task_custom_field_values"."number_value" > '-Infinity'::float8 and "task_custom_field_values"."number_value" < 'Infinity'::float8)),
	CONSTRAINT "task_custom_field_values_text_check" CHECK ("task_custom_field_values"."text_value" is null or char_length("task_custom_field_values"."text_value") <= 500)
);
--> statement-breakpoint
ALTER TABLE "task_custom_field_values" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_custom_field_values" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "space_custom_fields" ADD CONSTRAINT "space_custom_fields_space_fkey" FOREIGN KEY ("organization_id","space_id") REFERENCES "public"."spaces"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_custom_field_values" ADD CONSTRAINT "task_custom_field_values_task_fkey" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_custom_field_values" ADD CONSTRAINT "task_custom_field_values_field_fkey" FOREIGN KEY ("organization_id","field_id") REFERENCES "public"."space_custom_fields"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "space_custom_fields_space_index" ON "space_custom_fields" USING btree ("organization_id","space_id");--> statement-breakpoint
CREATE INDEX "space_custom_fields_active_order_index" ON "space_custom_fields" USING btree ("organization_id","space_id","position","id") WHERE "space_custom_fields"."retired_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "space_custom_fields_sprint_points_unique" ON "space_custom_fields" USING btree ("organization_id","space_id") WHERE "space_custom_fields"."retired_at" is null and "space_custom_fields"."sprint_points";--> statement-breakpoint
CREATE INDEX "task_custom_field_values_field_index" ON "task_custom_field_values" USING btree ("organization_id","field_id","task_id");--> statement-breakpoint
CREATE INDEX "task_custom_field_values_negative_index" ON "task_custom_field_values" USING btree ("organization_id","field_id") WHERE "task_custom_field_values"."number_value" < 0;--> statement-breakpoint
CREATE POLICY "space_custom_fields_organization_isolation" ON "space_custom_fields" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "task_custom_field_values_organization_isolation" ON "task_custom_field_values" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');

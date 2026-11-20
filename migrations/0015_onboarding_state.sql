CREATE TABLE "onboarding_states" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'in-progress' NOT NULL,
	"step" text DEFAULT 'space' NOT NULL,
	"preset" text DEFAULT 'dev' NOT NULL,
	"name" text,
	"prefix" text,
	"color" text DEFAULT 'violet' NOT NULL,
	"space_id" uuid,
	"first_list_id" uuid,
	"presentation" text DEFAULT 'expanded' NOT NULL,
	"first_task_created" boolean DEFAULT false NOT NULL,
	"invitation_sent" boolean DEFAULT false NOT NULL,
	"board_tried" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_states_pkey" PRIMARY KEY("organization_id","user_id"),
	CONSTRAINT "onboarding_states_version_check" CHECK ("onboarding_states"."version" >= 1),
	CONSTRAINT "onboarding_states_status_check" CHECK ("onboarding_states"."status" in ('in-progress', 'finished', 'dismissed')),
	CONSTRAINT "onboarding_states_step_check" CHECK ("onboarding_states"."step" in ('space', 'preset', 'team', 'import')),
	CONSTRAINT "onboarding_states_preset_check" CHECK ("onboarding_states"."preset" in ('dev', 'mkt', 'agency', 'blank')),
	CONSTRAINT "onboarding_states_color_check" CHECK ("onboarding_states"."color" in ('gris', 'violet', 'indigo', 'azur', 'lagon', 'vert', 'olive', 'jaune', 'orange', 'rouge', 'rose', 'fuchsia', 'ardoise')),
	CONSTRAINT "onboarding_states_presentation_check" CHECK ("onboarding_states"."presentation" in ('expanded', 'collapsed', 'dismissed')),
	CONSTRAINT "onboarding_states_provisioning_check" CHECK (("onboarding_states"."space_id" is null and "onboarding_states"."first_list_id" is null and "onboarding_states"."status" <> 'finished' and "onboarding_states"."first_task_created" = false and "onboarding_states"."board_tried" = false and "onboarding_states"."presentation" = 'expanded') or ("onboarding_states"."space_id" is not null and "onboarding_states"."first_list_id" is not null and "onboarding_states"."status" = 'finished' and "onboarding_states"."step" = 'import' and "onboarding_states"."name" is not null and "onboarding_states"."prefix" is not null))
);
--> statement-breakpoint
ALTER TABLE "onboarding_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "onboarding_states" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "onboarding_states_organization_isolation" ON "onboarding_states" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');

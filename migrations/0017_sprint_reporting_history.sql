CREATE TABLE "sprint_list_history" (
	"organization_id" uuid NOT NULL,
	"sequence" bigint GENERATED ALWAYS AS IDENTITY (sequence name "sprint_list_history_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"list_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"sprint_start_date" date,
	"sprint_end_date" date,
	"deleted_at" timestamp (3) with time zone,
	"recorded_at" timestamp (3) with time zone NOT NULL,
	"transaction_id" "xid8" NOT NULL,
	"baseline" boolean DEFAULT false NOT NULL,
	CONSTRAINT "sprint_list_history_pkey" PRIMARY KEY("organization_id","sequence")
);
--> statement-breakpoint
ALTER TABLE "sprint_list_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sprint_field_history" (
	"organization_id" uuid NOT NULL,
	"sequence" bigint GENERATED ALWAYS AS IDENTITY (sequence name "sprint_field_history_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"space_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"designated" boolean NOT NULL,
	"retired_at" timestamp (3) with time zone,
	"recorded_at" timestamp (3) with time zone NOT NULL,
	"transaction_id" "xid8" NOT NULL,
	"baseline" boolean DEFAULT false NOT NULL,
	CONSTRAINT "sprint_field_history_pkey" PRIMARY KEY("organization_id","sequence")
);
--> statement-breakpoint
ALTER TABLE "sprint_field_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sprint_history_coverage" (
	"singleton" boolean PRIMARY KEY NOT NULL,
	"started_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "sprint_history_coverage_singleton_check" CHECK ("sprint_history_coverage"."singleton")
);
--> statement-breakpoint
CREATE TABLE "sprint_task_history" (
	"organization_id" uuid NOT NULL,
	"sequence" bigint GENERATED ALWAYS AS IDENTITY (sequence name "sprint_task_history_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"task_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"estimate_minutes" integer,
	"milestone" boolean NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"trash_entry_id" uuid,
	"recorded_at" timestamp (3) with time zone NOT NULL,
	"transaction_id" "xid8" NOT NULL,
	"baseline" boolean DEFAULT false NOT NULL,
	CONSTRAINT "sprint_task_history_pkey" PRIMARY KEY("organization_id","sequence")
);
--> statement-breakpoint
ALTER TABLE "sprint_task_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sprint_value_history" (
	"organization_id" uuid NOT NULL,
	"sequence" bigint GENERATED ALWAYS AS IDENTITY (sequence name "sprint_value_history_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"task_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"number_value" double precision,
	"recorded_at" timestamp (3) with time zone NOT NULL,
	"transaction_id" "xid8" NOT NULL,
	"baseline" boolean DEFAULT false NOT NULL,
	CONSTRAINT "sprint_value_history_pkey" PRIMARY KEY("organization_id","sequence")
);
--> statement-breakpoint
ALTER TABLE "sprint_value_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sprint_list_history" ADD CONSTRAINT "sprint_list_history_list_fkey" FOREIGN KEY ("organization_id","list_id") REFERENCES "public"."lists"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_field_history" ADD CONSTRAINT "sprint_field_history_field_fkey" FOREIGN KEY ("organization_id","field_id") REFERENCES "public"."space_custom_fields"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_task_history" ADD CONSTRAINT "sprint_task_history_task_fkey" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_value_history" ADD CONSTRAINT "sprint_value_history_task_fkey" FOREIGN KEY ("organization_id","task_id") REFERENCES "public"."tasks"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sprint_list_history_list_time_index" ON "sprint_list_history" USING btree ("organization_id","list_id","recorded_at","sequence");--> statement-breakpoint
CREATE INDEX "sprint_field_history_space_field_time_index" ON "sprint_field_history" USING btree ("organization_id","space_id","field_id","recorded_at","sequence");--> statement-breakpoint
CREATE INDEX "sprint_task_history_task_time_index" ON "sprint_task_history" USING btree ("organization_id","task_id","recorded_at","sequence");--> statement-breakpoint
CREATE INDEX "sprint_task_history_list_task_index" ON "sprint_task_history" USING btree ("organization_id","list_id","task_id");--> statement-breakpoint
CREATE INDEX "sprint_value_history_task_field_time_index" ON "sprint_value_history" USING btree ("organization_id","task_id","field_id","recorded_at","sequence");--> statement-breakpoint
CREATE POLICY "sprint_list_history_organization_isolation" ON "sprint_list_history" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "sprint_field_history_organization_isolation" ON "sprint_field_history" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "sprint_task_history_organization_isolation" ON "sprint_task_history" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');--> statement-breakpoint
CREATE POLICY "sprint_value_history_organization_isolation" ON "sprint_value_history" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on') WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid or current_setting('app.system_access', true) = 'on');
--> statement-breakpoint
-- Append after the generated tables, indexes and policies in the same migration transaction.
ALTER TABLE public.sprint_task_history FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.sprint_value_history FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.sprint_field_history FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.sprint_list_history FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Deferred capture gives related writes the same effective time. Use millisecond precision
-- without rounding ahead of a report cutoff. The setting lasts only for this transaction.
CREATE FUNCTION public.sprint_history_recorded_at() RETURNS timestamptz
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  recorded_at timestamptz := nullif(current_setting('app.sprint_history_recorded_at', true), '')::timestamptz;
BEGIN
  IF recorded_at IS NULL THEN
    recorded_at := date_trunc('milliseconds', clock_timestamp());
    PERFORM set_config('app.sprint_history_recorded_at', recorded_at::text, true);
  END IF;
  RETURN recorded_at;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.capture_sprint_task_history() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  event_transaction xid8 := pg_current_xact_id();
BEGIN
  -- A physical purge can precede deferred capture even if an earlier statement changed this row.
  IF NOT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE organization_id = NEW.organization_id AND id = NEW.id
  ) THEN
    RETURN NULL;
  END IF;

  -- Rows inserted after activation already have their insertion recorded before their first update.
  IF TG_OP = 'UPDATE' AND NOT EXISTS (
    SELECT 1 FROM public.sprint_task_history
    WHERE organization_id = NEW.organization_id AND task_id = NEW.id
  ) THEN
    INSERT INTO public.sprint_task_history (
      organization_id, task_id, list_id, space_id, parent_id, name, status,
      estimate_minutes, milestone, archived_at, trash_entry_id, recorded_at, transaction_id, baseline
    ) VALUES (
      OLD.organization_id, OLD.id, OLD.list_id, OLD.space_id, OLD.parent_id, OLD.name, OLD.status,
      OLD.estimate_minutes, OLD.milestone, OLD.archived_at, OLD.trash_entry_id,
      (SELECT started_at FROM public.sprint_history_coverage WHERE singleton), event_transaction, true
    );
  END IF;

  INSERT INTO public.sprint_task_history (
    organization_id, task_id, list_id, space_id, parent_id, name, status,
    estimate_minutes, milestone, archived_at, trash_entry_id, recorded_at, transaction_id
  ) VALUES (
    NEW.organization_id, NEW.id, NEW.list_id, NEW.space_id, NEW.parent_id, NEW.name, NEW.status,
    NEW.estimate_minutes, NEW.milestone, NEW.archived_at, NEW.trash_entry_id,
    public.sprint_history_recorded_at(), event_transaction
  );
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.capture_sprint_numeric_value_history() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  source_row public.task_custom_field_values%ROWTYPE;
  event_transaction xid8 := pg_current_xact_id();
BEGIN
  IF TG_OP = 'DELETE' THEN
    source_row := OLD;
  ELSE
    source_row := NEW;
  END IF;

  -- The parent can have been removed by the same transaction as its cascading value deletes.
  IF NOT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE organization_id = source_row.organization_id AND id = source_row.task_id
  ) THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    IF OLD.number_value IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.sprint_value_history
      WHERE organization_id = OLD.organization_id AND task_id = OLD.task_id AND field_id = OLD.field_id
    ) THEN
      INSERT INTO public.sprint_value_history (
        organization_id, task_id, field_id, number_value, recorded_at, transaction_id, baseline
      ) VALUES (
        OLD.organization_id, OLD.task_id, OLD.field_id, OLD.number_value,
        (SELECT started_at FROM public.sprint_history_coverage WHERE singleton), event_transaction, true
      );
    END IF;
  END IF;

  INSERT INTO public.sprint_value_history (
    organization_id, task_id, field_id, number_value, recorded_at, transaction_id
  ) VALUES (
    source_row.organization_id, source_row.task_id, source_row.field_id,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE source_row.number_value END,
    public.sprint_history_recorded_at(), event_transaction
  );
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.capture_sprint_field_history() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  event_transaction xid8 := pg_current_xact_id();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.space_custom_fields
    WHERE organization_id = NEW.organization_id AND id = NEW.id
  ) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT EXISTS (
    SELECT 1 FROM public.sprint_field_history
    WHERE organization_id = OLD.organization_id AND space_id = OLD.space_id AND field_id = OLD.id
  ) THEN
    INSERT INTO public.sprint_field_history (
      organization_id, space_id, field_id, designated, retired_at, recorded_at, transaction_id, baseline
    ) VALUES (
      OLD.organization_id, OLD.space_id, OLD.id, OLD.sprint_points, OLD.retired_at,
      (SELECT started_at FROM public.sprint_history_coverage WHERE singleton), event_transaction, true
    );
  END IF;

  INSERT INTO public.sprint_field_history (
    organization_id, space_id, field_id, designated, retired_at, recorded_at, transaction_id
  ) VALUES (
    NEW.organization_id, NEW.space_id, NEW.id, NEW.sprint_points, NEW.retired_at,
    public.sprint_history_recorded_at(), event_transaction
  );
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.capture_sprint_list_history() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  event_transaction xid8 := pg_current_xact_id();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.lists
    WHERE organization_id = NEW.organization_id AND id = NEW.id
  ) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT EXISTS (
    SELECT 1 FROM public.sprint_list_history
    WHERE organization_id = NEW.organization_id AND list_id = NEW.id
  ) THEN
    INSERT INTO public.sprint_list_history (
      organization_id, list_id, space_id, sprint_start_date, sprint_end_date, deleted_at,
      recorded_at, transaction_id, baseline
    ) VALUES (
      OLD.organization_id, OLD.id, OLD.space_id, OLD.sprint_start_date, OLD.sprint_end_date, OLD.deleted_at,
      (SELECT started_at FROM public.sprint_history_coverage WHERE singleton), event_transaction, true
    );
  END IF;

  INSERT INTO public.sprint_list_history (
    organization_id, list_id, space_id, sprint_start_date, sprint_end_date, deleted_at,
    recorded_at, transaction_id
  ) VALUES (
    NEW.organization_id, NEW.id, NEW.space_id, NEW.sprint_start_date, NEW.sprint_end_date, NEW.deleted_at,
    public.sprint_history_recorded_at(), event_transaction
  );
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sprint_history_task_insert
AFTER INSERT ON public.tasks
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.capture_sprint_task_history();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sprint_history_task_update
AFTER UPDATE ON public.tasks
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (
  ROW(OLD.list_id, OLD.space_id, OLD.parent_id, OLD.name, OLD.status, OLD.estimate_minutes,
      OLD.milestone, OLD.archived_at, OLD.trash_entry_id)
  IS DISTINCT FROM
  ROW(NEW.list_id, NEW.space_id, NEW.parent_id, NEW.name, NEW.status, NEW.estimate_minutes,
      NEW.milestone, NEW.archived_at, NEW.trash_entry_id)
)
EXECUTE FUNCTION public.capture_sprint_task_history();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sprint_history_value_insert
AFTER INSERT ON public.task_custom_field_values
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW.number_value IS NOT NULL)
EXECUTE FUNCTION public.capture_sprint_numeric_value_history();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sprint_history_value_update
AFTER UPDATE ON public.task_custom_field_values
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (OLD.number_value IS DISTINCT FROM NEW.number_value)
EXECUTE FUNCTION public.capture_sprint_numeric_value_history();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sprint_history_value_delete
AFTER DELETE ON public.task_custom_field_values
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (OLD.number_value IS NOT NULL)
EXECUTE FUNCTION public.capture_sprint_numeric_value_history();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sprint_history_field_insert
AFTER INSERT ON public.space_custom_fields
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW.type = 'number')
EXECUTE FUNCTION public.capture_sprint_field_history();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sprint_history_field_update
AFTER UPDATE ON public.space_custom_fields
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (
  NEW.type = 'number'
  AND ROW(OLD.space_id, OLD.sprint_points, OLD.retired_at)
      IS DISTINCT FROM ROW(NEW.space_id, NEW.sprint_points, NEW.retired_at)
)
EXECUTE FUNCTION public.capture_sprint_field_history();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sprint_history_list_insert
AFTER INSERT ON public.lists
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.capture_sprint_list_history();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sprint_history_list_update
AFTER UPDATE ON public.lists
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (
  ROW(OLD.space_id, OLD.sprint_start_date, OLD.sprint_end_date, OLD.deleted_at)
  IS DISTINCT FROM ROW(NEW.space_id, NEW.sprint_start_date, NEW.sprint_end_date, NEW.deleted_at)
)
EXECUTE FUNCTION public.capture_sprint_list_history();
--> statement-breakpoint
-- Source writes are fenced by the trigger installation locks until this migration commits.
INSERT INTO public.sprint_history_coverage (singleton, started_at)
VALUES (true, date_trunc('milliseconds', clock_timestamp()));

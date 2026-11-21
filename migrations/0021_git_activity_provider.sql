ALTER TABLE "activity_entries" ADD COLUMN "actor_provider" text;--> statement-breakpoint
-- Existing rows have a null provider. Enforce the check on writes without scanning the table under the ALTER TABLE lock.
ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_actor_provider_check" CHECK ("activity_entries"."actor_provider" is null or ("activity_entries"."actor_type" = 'git' and "activity_entries"."actor_provider" in ('github', 'gitlab'))) NOT VALID;

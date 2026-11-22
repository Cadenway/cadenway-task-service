ALTER TABLE "list_grants" ADD COLUMN "member_id" uuid;--> statement-breakpoint
ALTER TABLE "space_grants" ADD COLUMN "member_id" uuid;--> statement-breakpoint

-- Membership facts stay in their owning module. Invoker rights and the explicit tenant
-- predicate preserve the table's forced RLS policy for every calling transaction.
CREATE FUNCTION public.organization_member_grant_is_effective(
  grant_organization_id uuid,
  grant_user_id uuid,
  grant_member_id uuid,
  grant_time timestamptz
) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members AS current_member
    WHERE current_member.organization_id = grant_organization_id
      AND current_member.user_id = grant_user_id
      AND current_member.removed_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_members AS other_member
        WHERE other_member.organization_id = grant_organization_id
          AND other_member.user_id = grant_user_id
          AND other_member.id <> current_member.id
          AND (grant_member_id IS NULL OR other_member.removed_at IS NULL)
      )
      AND (
        (grant_member_id IS NOT NULL AND current_member.id = grant_member_id)
        OR (grant_member_id IS NULL AND current_member.created_at < grant_time)
      )
  )
$function$;--> statement-breakpoint

-- A legacy row can have been rewritten by the previous application version while
-- an account rejoined. Remove it only once no active membership remains. Typed
-- rows are removed only for their own recorded, tombstoned membership.
CREATE FUNCTION public.organization_member_grant_is_obsolete(
  grant_organization_id uuid,
  grant_user_id uuid,
  grant_member_id uuid,
  grant_time timestamptz,
  removed_member_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members AS removed_member
    WHERE removed_member.organization_id = grant_organization_id
      AND removed_member.user_id = grant_user_id
      AND removed_member.removed_at IS NOT NULL
      AND (removed_member_id IS NULL OR removed_member.id = removed_member_id)
      AND (
        (grant_member_id IS NOT NULL AND removed_member.id = grant_member_id)
        OR (
          grant_member_id IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.organization_members AS active_member
            WHERE active_member.organization_id = grant_organization_id
              AND active_member.user_id = grant_user_id
              AND active_member.removed_at IS NULL
          )
        )
      )
  )
$function$;

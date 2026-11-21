import { sql } from 'drizzle-orm';
import type { SQL, SQLWrapper } from 'drizzle-orm';

/** The fields required by the membership checks published by organization-members. */
interface GrantMembershipFields {
  // #region Properties
  /** The organization that owns the grant. */
  readonly organizationId: SQLWrapper;

  /** The account granted access. */
  readonly userId: SQLWrapper;

  /** The membership recorded by the grant, nullable for older rows. */
  readonly memberId: SQLWrapper;

  /** The time when the current role was granted. */
  readonly grantedAt: SQLWrapper;
  // #endregion
}

/**
 * Checks that the grant belongs to the current, unambiguous membership.
 *
 * @param {GrantMembershipFields} grant - The grant table or its alias.
 * @returns {SQL} A tenant-scoped predicate evaluated in the caller's transaction.
 */
export function effectiveGrantCondition(grant: GrantMembershipFields): SQL {
  return sql`public.organization_member_grant_is_effective(${grant.organizationId}, ${grant.userId}, ${grant.memberId}, ${grant.grantedAt})`;
}

/**
 * Checks that the grant is attributable to a removed membership.
 *
 * @param {GrantMembershipFields} grant - The grant table or its alias.
 * @param {string} [removedMemberId] - The generation named by the job, absent for old jobs.
 * @returns {SQL} The predicate to use when selecting and deleting obsolete grants.
 */
export function obsoleteGrantCondition(
  grant: GrantMembershipFields,
  removedMemberId?: string,
): SQL {
  return sql`public.organization_member_grant_is_obsolete(${grant.organizationId}, ${grant.userId}, ${grant.memberId}, ${grant.grantedAt}, ${removedMemberId ?? null}::uuid)`;
}

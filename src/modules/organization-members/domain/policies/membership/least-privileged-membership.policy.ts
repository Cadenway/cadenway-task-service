import type { Membership } from '../../aggregates/membership/membership.aggregate.js';
import type { MemberRole } from '../../value-objects/membership/member-role.value-object.js';

/**
 * Constant privilegeOf
 *
 * @description
 * Rank of each role, from the least privileged: `guest` ("Invité"), `member` ("Membre"), `admin`
 * ("Administrateur"), `owner` ("Propriétaire").
 *
 * @type {Readonly<Record<MemberRole, number>>}
 */
const privilegeOf: Readonly<Record<MemberRole, number>> = Object.freeze({
  guest: 0,
  member: 1,
  admin: 2,
  owner: 3,
});

/**
 * Function leastPrivilegedMembership
 *
 * @description
 * The membership that answers for an account when the copy holds several active ones of that
 * account in one organization. That happens only for the time a removal takes to reach the copy
 * after the person joined again under a new `memberId` (`asyncapi/organization-service.yaml`,
 * "Memberships"): one of them is already removed at organization-service, and the copy cannot tell
 * which from the order the events reached it. The least privileged role answers, so a stale
 * membership never grants more than the current one (decision 4 of the P3a plan makes this copy
 * the source of the roles). Among equal roles, the first given wins.
 *
 * @param {readonly Membership[]} memberships - The active memberships of one account in one
 * organization, in a stable order.
 * @returns {Membership | null} The one that answers, or `null` when there is none.
 */
export function leastPrivilegedMembership(memberships: readonly Membership[]): Membership | null {
  let chosen: Membership | null = null;
  for (const membership of memberships) {
    if (
      chosen === null ||
      privilegeOf[membership.snapshot.role] < privilegeOf[chosen.snapshot.role]
    ) {
      chosen = membership;
    }
  }
  return chosen;
}

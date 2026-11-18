import { Membership } from '../../../../../domain/aggregates/membership/membership.aggregate.js';
import type { MemberRole } from '../../../../../domain/value-objects/membership/member-role.value-object.js';
import type { organizationMembers } from '../../schemas/membership/organization-member.schema.js';

/**
 * Type OrganizationMemberRow
 *
 * @description
 * A row of `organization_members`.
 *
 * @type {typeof organizationMembers.$inferSelect}
 */
export type OrganizationMemberRow = typeof organizationMembers.$inferSelect;

/**
 * Function toMembership
 *
 * @description
 * Maps a row to the membership it stores. The role is trusted: the `CHECK` constraint of the table
 * admits the four roles only.
 *
 * @param {OrganizationMemberRow} row - The row.
 * @returns {Membership} The membership.
 * @throws {InvalidMembershipStateError} When the stored version is not a positive integer.
 */
export function toMembership(row: OrganizationMemberRow): Membership {
  return Membership.restore({
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    role: row.role as MemberRole,
    version: row.version,
    removedAt: row.removedAt,
  });
}

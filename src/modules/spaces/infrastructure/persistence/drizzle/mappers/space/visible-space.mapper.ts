import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { SpaceWithGrants } from '../../../../../application/models/access/space-with-grants.model.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { listGrants } from '../../schemas/access/list-grant.schema.js';
import { spaceGrants } from '../../schemas/access/space-grant.schema.js';
import { spaces } from '../../schemas/space/space.schema.js';
import { toAccessRole } from '../access/stored-grant.mapper.js';
import { toSpace } from './space.mapper.js';
import type { SpaceRow } from './space.mapper.js';

/**
 * Function spaceGrantRoleOf
 *
 * @description
 * The role the grant of a member on the space of the row gives, `null` without one: a lookup by
 * the primary key of `space_grants` `(organization_id, space_id, user_id)`, over the columns of
 * `spaces`.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {string} viewerUserId - The account of the member.
 * @returns {SQL<string | null>} The scalar subquery.
 */
export function spaceGrantRoleOf(organizationId: string, viewerUserId: string): SQL<string | null> {
  return sql<
    string | null
  >`(select ${spaceGrants.role} from ${spaceGrants} where ${spaceGrants.organizationId} = ${organizationId} and ${spaceGrants.spaceId} = ${spaces.id} and ${spaceGrants.userId} = ${viewerUserId})`;
}

/**
 * Function anyListGrantOf
 *
 * @description
 * Whether a member holds a grant of at least one list of the space of the row: a range of
 * `list_grants_user_index` `(organization_id, user_id, space_id, list_id)`, which `space_id`, a
 * copy of the space of the list, makes possible.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {string} viewerUserId - The account of the member.
 * @returns {SQL<boolean>} The `exists` subquery.
 */
export function anyListGrantOf(organizationId: string, viewerUserId: string): SQL<boolean> {
  return sql<boolean>`exists (select 1 from ${listGrants} where ${listGrants.organizationId} = ${organizationId} and ${listGrants.userId} = ${viewerUserId} and ${listGrants.spaceId} = ${spaces.id})`;
}

/**
 * Function visibleSpaceCondition
 *
 * @description
 * The ONE condition that keeps the spaces a member sees ("Access" and "Who sees a space" of
 * `openapi/public/spaces.yaml`, `canSeeSpace` of the domain), never one awaiting an owner: for a
 * member who is not a guest, the spaces of the whole organization, the ones they own and the ones
 * shared with them; for anyone, the spaces of the lists shared with them. Every query that lists
 * spaces applies it, and selects the grants of the member with `spaceGrantRoleOf` and
 * `anyListGrantOf`, from which the application computes the role of each row with the policies of
 * the domain. It is parenthesized as a whole, so it stays one term under `not` or `or`. The
 * caller names `organization_id` of `spaces`.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {Viewer} viewer - The member and its role in the organization.
 * @returns {SQL} The condition, over the columns of `spaces`.
 */
export function visibleSpaceCondition(organizationId: string, viewer: Viewer): SQL {
  const throughLists: SQL<boolean> = anyListGrantOf(organizationId, viewer.userId);
  if (viewer.role === 'guest') {
    return sql`(not ${spaces.awaitingOwner} and ${throughLists})`;
  }
  return sql`(not ${spaces.awaitingOwner} and (${spaces.visibility} = 'organization' or ${spaces.ownerUserId} = ${viewer.userId} or ${spaceGrantRoleOf(organizationId, viewer.userId)} is not null or ${throughLists}))`;
}

/**
 * Interface VisibleSpaceRow
 *
 * @description
 * A row of a collection of spaces read for a member: the space and the grants of the member there.
 */
export interface VisibleSpaceRow {
  // #region Properties
  /**
   * Property space
   *
   * @description
   * The row of `spaces`.
   *
   * @type {SpaceRow}
   * @readonly
   */
  readonly space: SpaceRow;

  /**
   * Property spaceGrantRole
   *
   * @description
   * The role of the grant of the member on the space, `null` without one.
   *
   * @type {string | null}
   * @readonly
   */
  readonly spaceGrantRole: string | null;

  /**
   * Property anyListGrant
   *
   * @description
   * Whether the member holds a grant of at least one list of the space.
   *
   * @type {boolean}
   * @readonly
   */
  readonly anyListGrant: boolean;
  // #endregion
}

/**
 * Function visibleSpaceColumns
 *
 * @description
 * The columns a collection of spaces selects for a member: the space and the grants of the member
 * there.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {string} viewerUserId - The account of the member.
 * @returns {object} The selection of the query.
 */
export function visibleSpaceColumns(
  organizationId: string,
  viewerUserId: string,
): {
  space: typeof spaces;
  spaceGrantRole: SQL<string | null>;
  anyListGrant: SQL<boolean>;
} {
  return {
    space: spaces,
    spaceGrantRole: spaceGrantRoleOf(organizationId, viewerUserId),
    anyListGrant: anyListGrantOf(organizationId, viewerUserId),
  };
}

/**
 * Function toSpaceWithGrants
 *
 * @description
 * Maps a row of a collection of spaces to the space and the grants of the member there.
 *
 * @param {VisibleSpaceRow} row - The row.
 * @returns {SpaceWithGrants} The space with the grants of the member.
 * @throws {Error} When a stored value is outside its set.
 */
export function toSpaceWithGrants(row: VisibleSpaceRow): SpaceWithGrants {
  return {
    space: toSpace(row.space),
    grants: { space: toAccessRole(row.spaceGrantRole), list: null, anyList: row.anyListGrant },
  };
}

import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { SpaceWithGrants } from '../../../../../application/models/access/space-with-grants.model.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { listGrants } from '../../schemas/access/list-grant.schema.js';
import { spaceGrants } from '../../schemas/access/space-grant.schema.js';
import { taskLists } from '../../schemas/list/task-list.schema.js';
import { spaces } from '../../schemas/space/space.schema.js';
import { effectiveGrantCondition } from '../access/grant-membership.mapper.js';
import { toAccessRole } from '../access/stored-grant.mapper.js';
import { undeletedListCondition } from '../list/list-tombstone.mapper.js';
import { undeletedSpaceCondition } from './space-tombstone.mapper.js';
import { toSpace } from './space.mapper.js';
import type { SpaceRow } from './space.mapper.js';

/**
 * Constant viewerSpaceGrant
 *
 * @description
 * `space_grants` as `viewer_space_grant`: the grant of the viewer on the space of a row, left
 * joined with `viewerSpaceGrantJoin` on the full primary key `(organization_id, space_id,
 * user_id)`, so that each row reads it once. The collections of lists join it too, on the space of
 * the list.
 *
 * @type {ReturnType<typeof alias<typeof spaceGrants, 'viewer_space_grant'>>}
 */
export const viewerSpaceGrant = alias(spaceGrants, 'viewer_space_grant');

/**
 * Constant LIST_SPACES_SPACE_ID
 *
 * @description
 * The column `space_id` of the subquery `viewer_list_spaces` of `viewerListSpaces`: not `null`
 * when the viewer holds a grant of a list of the space of the row.
 *
 * @type {SQL}
 */
const LIST_SPACES_SPACE_ID: SQL = sql`${sql.identifier('viewer_list_spaces')}.${sql.identifier('space_id')}`;

/**
 * Function viewerSpaceGrantJoin
 *
 * @description
 * The condition of the left join of `viewerSpaceGrant`: the grant of the viewer on the space of
 * the row (`spaces.id`), one probe of the primary key of `space_grants`.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {string} viewerUserId - The account of the member.
 * @returns {SQL} The join condition.
 */
export function viewerSpaceGrantJoin(organizationId: string, viewerUserId: string): SQL {
  return sql`${viewerSpaceGrant.organizationId} = ${organizationId} and ${viewerSpaceGrant.spaceId} = ${spaces.id} and ${viewerSpaceGrant.userId} = ${viewerUserId} and ${effectiveGrantCondition(viewerSpaceGrant)}`;
}

/**
 * Function viewerListSpaces
 *
 * @description
 * The spaces of the lists shared with a viewer, as the subquery `viewer_list_spaces`
 * (`select distinct space_id from list_grants join lists where organization_id = $org and
 * user_id = $viewer and the list is not deleted`), to left join with `viewerListSpacesJoin`: one
 * range of `list_grants_user_index` `(organization_id, user_id, space_id, list_id)`, which
 * `list_grants.space_id`, a copy of the space of the list, makes possible, read once for the whole
 * collection, and one probe of the primary key of `lists` per grant, so that a grant of a deleted
 * list, which the tombstone keeps, shows no space (O(grants of the viewer)). The `lists` of the
 * subquery is its own: the collections of spaces that join it read no other `lists`.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {string} viewerUserId - The account of the member.
 * @returns {SQL} The aliased subquery.
 */
export function viewerListSpaces(organizationId: string, viewerUserId: string): SQL {
  return sql`(select distinct ${listGrants.spaceId} from ${listGrants} inner join ${taskLists} on ${taskLists.organizationId} = ${listGrants.organizationId} and ${taskLists.id} = ${listGrants.listId} where ${listGrants.organizationId} = ${organizationId} and ${listGrants.userId} = ${viewerUserId} and ${effectiveGrantCondition(listGrants)} and ${undeletedListCondition()}) as ${sql.identifier('viewer_list_spaces')}`;
}

/**
 * Function viewerListSpacesJoin
 *
 * @description
 * The condition of the left join of `viewerListSpaces`: the space of the row.
 *
 * @returns {SQL} The join condition.
 */
export function viewerListSpacesJoin(): SQL {
  return sql`${LIST_SPACES_SPACE_ID} = ${spaces.id}`;
}

/**
 * Function visibleSpaceCondition
 *
 * @description
 * The ONE condition that keeps the spaces a member sees ("Access" and "Who sees a space" of
 * `openapi/public/spaces.yaml`, `canSeeSpace` of the domain), never a deleted one
 * (`undeletedSpaceCondition`) nor one awaiting an owner: for a member who is not a guest, the
 * spaces of the whole organization, the ones they own and the ones shared with them
 * (`viewer_space_grant`); for anyone, the spaces of the lists shared with them that are not
 * deleted (`viewer_list_spaces`). Every query that lists spaces applies it over `spaces` left
 * joined to `viewerSpaceGrant` and to `viewerListSpaces`, and selects the same grants with
 * `visibleSpaceColumns`, from which the application computes the role of each row with the
 * policies of the domain. It is parenthesized as a whole, so it stays one term under `not` or
 * `or`. The caller names `organization_id` of `spaces`.
 *
 * @param {Viewer} viewer - The member and its role in the organization.
 * @returns {SQL} The condition, over the columns of `spaces` and of the two joins.
 */
export function visibleSpaceCondition(viewer: Viewer): SQL {
  const throughLists: SQL = sql`${LIST_SPACES_SPACE_ID} is not null`;
  if (viewer.role === 'guest') {
    return sql`(${undeletedSpaceCondition()} and not ${spaces.awaitingOwner} and ${throughLists})`;
  }
  return sql`(${undeletedSpaceCondition()} and not ${spaces.awaitingOwner} and (${spaces.visibility} = 'organization' or ${spaces.ownerUserId} = ${viewer.userId} or ${viewerSpaceGrant.role} is not null or ${throughLists}))`;
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
 * there, read from the two joins of `visibleSpaceCondition`.
 *
 * @returns {object} The selection of the query.
 */
export function visibleSpaceColumns(): {
  space: typeof spaces;
  spaceGrantRole: typeof viewerSpaceGrant.role;
  anyListGrant: SQL<boolean>;
} {
  return {
    space: spaces,
    spaceGrantRole: viewerSpaceGrant.role,
    anyListGrant: sql<boolean>`${LIST_SPACES_SPACE_ID} is not null`,
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

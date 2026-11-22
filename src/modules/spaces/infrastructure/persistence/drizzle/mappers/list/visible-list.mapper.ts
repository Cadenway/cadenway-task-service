import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { ListWithGrants } from '../../../../../application/models/access/list-with-grants.model.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { listGrants } from '../../schemas/access/list-grant.schema.js';
import { taskLists } from '../../schemas/list/task-list.schema.js';
import { spaces } from '../../schemas/space/space.schema.js';
import { effectiveGrantCondition } from '../access/grant-membership.mapper.js';
import { toAccessRole } from '../access/stored-grant.mapper.js';
import { toVisibility } from '../space/space.mapper.js';
import { undeletedSpaceCondition } from '../space/space-tombstone.mapper.js';
import { viewerSpaceGrant } from '../space/visible-space.mapper.js';
import { undeletedListCondition } from './list-tombstone.mapper.js';
import { toTaskList } from './task-list.mapper.js';
import type { TaskListRow } from './task-list.mapper.js';

/**
 * Interface VisibleListRow
 *
 * @description
 * A row of a collection of lists read for a member: the list, what the effective role reads of
 * its space, and the grants of the member on the space and the list (`null` without one).
 */
export interface VisibleListRow {
  // #region Properties
  /**
   * Property list
   *
   * @description
   * The row of `lists`.
   *
   * @type {TaskListRow}
   * @readonly
   */
  readonly list: TaskListRow;

  /**
   * Property visibility
   *
   * @description
   * The visibility of the space of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly visibility: string;

  /**
   * Property ownerUserId
   *
   * @description
   * The owner of the space of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly ownerUserId: string;

  /**
   * Property awaitingOwner
   *
   * @description
   * Whether the space of the list awaits an owner.
   *
   * @type {boolean}
   * @readonly
   */
  readonly awaitingOwner: boolean;

  /**
   * Property spaceDeletedAt
   *
   * @description
   * When the space of the list was deleted, `null` for a live one.
   *
   * @type {Date | null}
   * @readonly
   */
  readonly spaceDeletedAt: Date | null;

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
   * Property listGrantRole
   *
   * @description
   * The role of the grant of the member on the list, `null` without one.
   *
   * @type {string | null}
   * @readonly
   */
  readonly listGrantRole: string | null;
  // #endregion
}

/**
 * Constant viewerListGrant
 *
 * @description
 * `list_grants` as `viewer_list_grant`: the grant of the viewer on the list of a row, left joined
 * with `viewerListGrantJoin` on the full primary key `(organization_id, list_id, user_id)`, so
 * that each row reads it once.
 *
 * @type {ReturnType<typeof alias<typeof listGrants, 'viewer_list_grant'>>}
 */
export const viewerListGrant = alias(listGrants, 'viewer_list_grant');

/**
 * Function viewerListGrantJoin
 *
 * @description
 * The condition of the left join of `viewerListGrant`: the grant of the viewer on the list of the
 * row (`lists.id`), one probe of the primary key of `list_grants`. The collections of lists also
 * left join `viewerSpaceGrant` with `viewerSpaceGrantJoin`, on the space of the list they join.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {string} viewerUserId - The account of the member.
 * @returns {SQL} The join condition.
 */
export function viewerListGrantJoin(organizationId: string, viewerUserId: string): SQL {
  return sql`${viewerListGrant.organizationId} = ${organizationId} and ${viewerListGrant.listId} = ${taskLists.id} and ${viewerListGrant.userId} = ${viewerUserId} and ${effectiveGrantCondition(viewerListGrant)}`;
}

/**
 * Function visibleListCondition
 *
 * @description
 * The ONE condition that keeps the lists a member has a role on ("Access" of
 * `openapi/public/spaces.yaml`, `listRoleOf` of the domain): neither the list nor its space is
 * deleted (`undeletedListCondition`, `undeletedSpaceCondition`), and `listAccessCondition`. Every
 * query that lists lists applies it over `lists` joined to `spaces` on `(organization_id, id)` and
 * left joined to `viewerSpaceGrant` and `viewerListGrant`, and selects the same two grants, from
 * which the application computes the role of each row with `listRoleOf`. It is parenthesized as a
 * whole, so it stays one term under `not` or `or`. The caller names `organization_id` of `lists`.
 *
 * @param {Viewer} viewer - The member and its role in the organization.
 * @returns {SQL} The condition, over the columns of `lists`, `spaces` and the two joins.
 */
export function visibleListCondition(viewer: Viewer): SQL {
  return sql`(${undeletedListCondition()} and ${undeletedSpaceCondition()} and ${listAccessCondition(viewer)})`;
}

/**
 * Function listAccessCondition
 *
 * @description
 * The condition that keeps the lists a member has, or would have if neither the list nor its space
 * were deleted, a role on (`listRoleAsIfNotDeletedOf` of the domain, "Who" of
 * `openapi/public/trash.yaml`), never one of a space awaiting an owner: a grant of the list, for
 * anyone, guests included; for a member who is not a guest, also the ownership of the space, a
 * space `organization` with the switch "Accès de l’organisation" of the list on, and a grant of the
 * space. `visibleListCondition` adds the tombstones to it; the trash reads it alone. It is
 * parenthesized as a whole, over the same joins as `visibleListCondition`.
 *
 * @param {Viewer} viewer - The member and its role in the organization.
 * @returns {SQL} The condition, over the columns of `lists`, `spaces` and the two joins.
 */
export function listAccessCondition(viewer: Viewer): SQL {
  const listGrant: SQL = sql`${viewerListGrant.role} is not null`;
  if (viewer.role === 'guest') {
    return sql`(not ${spaces.awaitingOwner} and ${listGrant})`;
  }
  return sql`(not ${spaces.awaitingOwner} and (${listGrant} or ${spaces.ownerUserId} = ${viewer.userId} or (${spaces.visibility} = 'organization' and ${taskLists.organizationAccess}) or ${viewerSpaceGrant.role} is not null))`;
}

/**
 * Function visibleListColumns
 *
 * @description
 * The columns a collection of lists selects for a member: the list, what the effective role reads
 * of its space, and the two grants of the member, read from the joins of `visibleListCondition`.
 *
 * @returns {object} The selection of the query.
 */
export function visibleListColumns(): {
  list: typeof taskLists;
  visibility: typeof spaces.visibility;
  ownerUserId: typeof spaces.ownerUserId;
  awaitingOwner: typeof spaces.awaitingOwner;
  spaceDeletedAt: typeof spaces.deletedAt;
  spaceGrantRole: typeof viewerSpaceGrant.role;
  listGrantRole: typeof viewerListGrant.role;
} {
  return {
    list: taskLists,
    visibility: spaces.visibility,
    ownerUserId: spaces.ownerUserId,
    awaitingOwner: spaces.awaitingOwner,
    spaceDeletedAt: spaces.deletedAt,
    spaceGrantRole: viewerSpaceGrant.role,
    listGrantRole: viewerListGrant.role,
  };
}

/**
 * Function toListWithGrants
 *
 * @description
 * Maps a row of a collection of lists to the list, its space as the policies read it, and the
 * grants of the member.
 *
 * @param {VisibleListRow} row - The row.
 * @returns {ListWithGrants} The list with the grants of the member.
 * @throws {Error} When a stored value is outside its set.
 */
export function toListWithGrants(row: VisibleListRow): ListWithGrants {
  return {
    list: toTaskList(row.list),
    space: {
      visibility: toVisibility(row.visibility),
      ownerUserId: row.ownerUserId,
      awaitingOwner: row.awaitingOwner,
      deletedAt: row.spaceDeletedAt,
    },
    grants: {
      space: toAccessRole(row.spaceGrantRole),
      list: toAccessRole(row.listGrantRole),
    },
  };
}

import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { ListWithGrants } from '../../../../../application/models/access/list-with-grants.model.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { listGrants } from '../../schemas/access/list-grant.schema.js';
import { taskLists } from '../../schemas/list/task-list.schema.js';
import { spaces } from '../../schemas/space/space.schema.js';
import { toAccessRole } from '../access/stored-grant.mapper.js';
import { toVisibility } from '../space/space.mapper.js';
import { spaceGrantRoleOf } from '../space/visible-space.mapper.js';
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
 * Function listGrantRoleOf
 *
 * @description
 * The role the grant of a member on the list of the row gives, `null` without one: a lookup by the
 * primary key of `list_grants` `(organization_id, list_id, user_id)`, over the columns of `lists`.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {string} viewerUserId - The account of the member.
 * @returns {SQL<string | null>} The scalar subquery.
 */
export function listGrantRoleOf(organizationId: string, viewerUserId: string): SQL<string | null> {
  return sql<
    string | null
  >`(select ${listGrants.role} from ${listGrants} where ${listGrants.organizationId} = ${organizationId} and ${listGrants.listId} = ${taskLists.id} and ${listGrants.userId} = ${viewerUserId})`;
}

/**
 * Function visibleListCondition
 *
 * @description
 * The ONE condition that keeps the lists a member has a role on ("Access" of
 * `openapi/public/spaces.yaml`, `listRoleOf` of the domain), never one of a space awaiting an
 * owner: a grant of the list, for anyone, guests included; for a member who is not a guest, also
 * the ownership of the space, a space `organization` with the switch "Accès de l’organisation" of
 * the list on, and a grant of the space. Every query that lists lists applies it, over `lists`
 * joined to `spaces` on `(organization_id, id)`, and selects the grants of the member with
 * `listGrantRoleOf` and `spaceGrantRoleOf`, from which the application computes the role of each
 * row with `listRoleOf`. It is parenthesized as a whole, so it stays one term under `not` or `or`.
 * The caller names `organization_id` of `lists`.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {Viewer} viewer - The member and its role in the organization.
 * @returns {SQL} The condition, over the columns of `lists` and `spaces`.
 */
export function visibleListCondition(organizationId: string, viewer: Viewer): SQL {
  const listGrant: SQL = sql`${listGrantRoleOf(organizationId, viewer.userId)} is not null`;
  if (viewer.role === 'guest') {
    return sql`(not ${spaces.awaitingOwner} and ${listGrant})`;
  }
  return sql`(not ${spaces.awaitingOwner} and (${listGrant} or ${spaces.ownerUserId} = ${viewer.userId} or (${spaces.visibility} = 'organization' and ${taskLists.organizationAccess}) or ${spaceGrantRoleOf(organizationId, viewer.userId)} is not null))`;
}

/**
 * Function visibleListColumns
 *
 * @description
 * The columns a collection of lists selects for a member: the list, what the effective role reads
 * of its space, and the two grants of the member.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {string} viewerUserId - The account of the member.
 * @returns {object} The selection of the query.
 */
export function visibleListColumns(
  organizationId: string,
  viewerUserId: string,
): {
  list: typeof taskLists;
  visibility: typeof spaces.visibility;
  ownerUserId: typeof spaces.ownerUserId;
  awaitingOwner: typeof spaces.awaitingOwner;
  spaceGrantRole: SQL<string | null>;
  listGrantRole: SQL<string | null>;
} {
  return {
    list: taskLists,
    visibility: spaces.visibility,
    ownerUserId: spaces.ownerUserId,
    awaitingOwner: spaces.awaitingOwner,
    spaceGrantRole: spaceGrantRoleOf(organizationId, viewerUserId),
    listGrantRole: listGrantRoleOf(organizationId, viewerUserId),
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
    },
    grants: {
      space: toAccessRole(row.spaceGrantRole),
      list: toAccessRole(row.listGrantRole),
    },
  };
}

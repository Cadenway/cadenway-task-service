import type { ListAccess } from '../../../../../application/models/access/list-access.model.js';
import { taskLists } from '../../schemas/list/task-list.schema.js';
import { spaces } from '../../schemas/space/space.schema.js';
import { toAccessRole } from '../access/stored-grant.mapper.js';
import { toVisibility } from '../space/space.mapper.js';
import { viewerSpaceGrant } from '../space/visible-space.mapper.js';
import { viewerListGrant } from './visible-list.mapper.js';

/**
 * Interface ListAccessRow
 *
 * @description
 * A lean row of a collection of lists read for a member: what the effective role reads, without
 * the name, the look or the sprint of the list.
 */
export interface ListAccessRow {
  // #region Properties
  /**
   * Property listId
   *
   * @description
   * `lists.id`.
   *
   * @type {string}
   * @readonly
   */
  readonly listId: string;

  /**
   * Property spaceId
   *
   * @description
   * `lists.space_id`.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;

  /**
   * Property organizationAccess
   *
   * @description
   * `lists.organization_access`.
   *
   * @type {boolean}
   * @readonly
   */
  readonly organizationAccess: boolean;

  /**
   * Property deletedAt
   *
   * @description
   * `lists.deleted_at`.
   *
   * @type {Date | null}
   * @readonly
   */
  readonly deletedAt: Date | null;

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
 * Function listAccessColumns
 *
 * @description
 * The lean selection of a collection of lists read for roles only, over the joins of
 * `visibleListCondition`.
 *
 * @returns {object} The selection of the query.
 */
export function listAccessColumns(): {
  listId: typeof taskLists.id;
  spaceId: typeof taskLists.spaceId;
  organizationAccess: typeof taskLists.organizationAccess;
  deletedAt: typeof taskLists.deletedAt;
  visibility: typeof spaces.visibility;
  ownerUserId: typeof spaces.ownerUserId;
  awaitingOwner: typeof spaces.awaitingOwner;
  spaceDeletedAt: typeof spaces.deletedAt;
  spaceGrantRole: typeof viewerSpaceGrant.role;
  listGrantRole: typeof viewerListGrant.role;
} {
  return {
    listId: taskLists.id,
    spaceId: taskLists.spaceId,
    organizationAccess: taskLists.organizationAccess,
    deletedAt: taskLists.deletedAt,
    visibility: spaces.visibility,
    ownerUserId: spaces.ownerUserId,
    awaitingOwner: spaces.awaitingOwner,
    spaceDeletedAt: spaces.deletedAt,
    spaceGrantRole: viewerSpaceGrant.role,
    listGrantRole: viewerListGrant.role,
  };
}

/**
 * Function toListAccess
 *
 * @description
 * Maps a lean row to what the effective role of the member on the list reads.
 *
 * @param {ListAccessRow} row - The row.
 * @returns {ListAccess} The access of the list.
 * @throws {Error} When a stored value is outside its set.
 */
export function toListAccess(row: ListAccessRow): ListAccess {
  return {
    listId: row.listId,
    spaceId: row.spaceId,
    organizationAccess: row.organizationAccess,
    deletedAt: row.deletedAt,
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

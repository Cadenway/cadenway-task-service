import type { TrashListAccess } from '../../../../../application/models/list/trash-list-access.model.js';
import { taskLists } from '../../schemas/list/task-list.schema.js';
import { spaces } from '../../schemas/space/space.schema.js';
import { toAccessRole } from '../access/stored-grant.mapper.js';
import { toVisibility } from '../space/space.mapper.js';
import { viewerSpaceGrant } from '../space/visible-space.mapper.js';
import { viewerListGrant } from './visible-list.mapper.js';

/**
 * Interface TrashListAccessRow
 *
 * @description
 * A lean row of the trash reads of lists: what the state of a list and the role of a member as if
 * not deleted read, and its name, nothing else.
 */
export interface TrashListAccessRow {
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
   * Property name
   *
   * @description
   * `lists.name`.
   *
   * @type {string}
   * @readonly
   */
  readonly name: string;

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
   * Property archivedAt
   *
   * @description
   * `lists.archived_at`.
   *
   * @type {Date | null}
   * @readonly
   */
  readonly archivedAt: Date | null;

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
 * Function trashListAccessColumns
 *
 * @description
 * The lean selection of the trash reads of lists, over the joins of `listAccessCondition`: no
 * look, no sprint, no version.
 *
 * @returns {object} The selection of the query.
 */
export function trashListAccessColumns(): {
  listId: typeof taskLists.id;
  spaceId: typeof taskLists.spaceId;
  name: typeof taskLists.name;
  organizationAccess: typeof taskLists.organizationAccess;
  archivedAt: typeof taskLists.archivedAt;
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
    name: taskLists.name,
    organizationAccess: taskLists.organizationAccess,
    archivedAt: taskLists.archivedAt,
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
 * Function toTrashListAccess
 *
 * @description
 * Maps a lean row of the trash reads to what the state of the list and the role of the member as
 * if not deleted read.
 *
 * @param {TrashListAccessRow} row - The row.
 * @returns {TrashListAccess} The access of the list.
 * @throws {Error} When a stored value is outside its set.
 */
export function toTrashListAccess(row: TrashListAccessRow): TrashListAccess {
  return {
    listId: row.listId,
    spaceId: row.spaceId,
    name: row.name,
    organizationAccess: row.organizationAccess,
    archivedAt: row.archivedAt,
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

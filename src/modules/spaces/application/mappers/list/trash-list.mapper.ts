import { listStateOf } from '../../../domain/policies/list/list-state.policy.js';
import type { TrashListAccess } from '../../models/list/trash-list-access.model.js';
import type { TrashList } from '../../projections/list/trash-list.projection.js';

/**
 * Function toTrashList
 *
 * @description
 * Copies a lean row of the trash reads into its public projection, with the state of the list
 * (`listStateOf`: `deleted` when the list or its space is deleted, else `archived` or `active`),
 * so that no type of the domain crosses the public entry points.
 *
 * @param {TrashListAccess} row - The lean row.
 * @returns {TrashList} The projection.
 */
export function toTrashList(row: TrashListAccess): TrashList {
  return {
    id: row.listId,
    spaceId: row.spaceId,
    name: row.name,
    state: listStateOf({ archivedAt: row.archivedAt, deletedAt: row.deletedAt }, row.space),
  };
}

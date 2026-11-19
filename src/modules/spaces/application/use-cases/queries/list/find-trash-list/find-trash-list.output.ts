import type { TrashList } from '../../../../projections/list/trash-list.projection.js';

/**
 * Interface FindTrashListOutput
 *
 * @description
 * The list of a trash entry with the role the member has on it, or would have if neither the list
 * nor its space were deleted ("Who" of `openapi/public/trash.yaml`).
 */
export interface FindTrashListOutput {
  // #region Properties
  /**
   * Property list
   *
   * @description
   * The list, live, archived or deleted, with its name and its state as they are now.
   *
   * @type {TrashList}
   * @readonly
   */
  readonly list: TrashList;

  /**
   * Property role
   *
   * @description
   * The role of the member on the list as if neither it nor its space were deleted: the trash
   * needs `edit` to show, restore or erase an entry of it.
   *
   * @type {'edit' | 'comment' | 'view'}
   * @readonly
   */
  readonly role: 'edit' | 'comment' | 'view';
  // #endregion
}

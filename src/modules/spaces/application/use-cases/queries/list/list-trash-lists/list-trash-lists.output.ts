import type { TrashList } from '../../../../projections/list/trash-list.projection.js';

/**
 * Interface ListTrashListsOutput
 *
 * @description
 * The lists whose trash entries a member may see, each with the role they would have on it ("Who"
 * of `openapi/public/trash.yaml`); the caller keeps those its own threshold of a change accepts.
 */
export interface ListTrashListsOutput {
  // #region Properties
  /**
   * Property lists
   *
   * @description
   * Every list of the organization, live, archived or deleted, in a live or deleted space, on
   * which the member has a role, or would have one if neither the list nor its space were deleted,
   * with that role; in no particular order.
   *
   * @type {readonly { readonly list: TrashList; readonly role: 'edit' | 'comment' | 'view' }[]}
   * @readonly
   */
  readonly lists: readonly {
    readonly list: TrashList;
    readonly role: 'edit' | 'comment' | 'view';
  }[];
  // #endregion
}

/**
 * Interface TrashPosition
 *
 * @description
 * Where a page of the trash stops: the deletion instant and the id of its last entry, in the order
 * of the page (`trashed_at desc, id desc`, the most recently deleted first).
 */
export interface TrashPosition {
  // #region Properties
  /** When the last entry of the page was deleted. */
  readonly trashedAt: Date;

  /** Id of that entry. */
  readonly id: string;
  // #endregion
}

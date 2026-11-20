/**
 * Interface RootPosition
 *
 * @description
 * Where the last batch of the move of a deleted list to the trash stopped: the last candidate root
 * it took, in the `(created_at, id)` order of the tasks of the list. Kept in memory by one attempt
 * of the job; a new attempt starts again from the first root still to move.
 */
export interface RootPosition {
  // #region Properties
  /**
   * Property createdAt
   *
   * @description
   * The creation of the root.
   *
   * @type {Date}
   * @readonly
   */
  readonly createdAt: Date;

  /**
   * Property id
   *
   * @description
   * The id of the root, which breaks the ties of `createdAt`.
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;
  // #endregion
}

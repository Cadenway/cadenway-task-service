/**
 * Interface TrashErasureCounts
 *
 * @description
 * What an erasure of trash entries erased: the tasks, and the deleted lists and spaces it left
 * without a task, which the spaces module erased after them.
 */
export interface TrashErasureCounts {
  // #region Properties
  /** The tasks erased. */
  readonly tasks: number;

  /** The deleted lists erased. */
  readonly listsPurged: number;

  /** The deleted spaces erased with their last list. */
  readonly spacesPurged: number;
  // #endregion
}

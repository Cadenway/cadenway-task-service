/**
 * Interface ChecklistCounts
 *
 * @description
 * The items of the checklist of a task, and those ticked.
 */
export interface ChecklistCounts {
  // #region Properties
  /** Items of the checklist. */
  readonly total: number;

  /** Items ticked. */
  readonly done: number;
  // #endregion
}

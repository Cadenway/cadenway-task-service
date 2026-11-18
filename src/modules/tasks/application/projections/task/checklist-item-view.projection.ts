/**
 * Interface ChecklistItemView
 *
 * @description
 * One item of the checklist of a task.
 */
export interface ChecklistItemView {
  // #region Properties
  /** Id of the item. */
  readonly id: string;

  /** Text of the item. */
  readonly text: string;

  /** Whether the item is ticked. */
  readonly done: boolean;
  // #endregion
}

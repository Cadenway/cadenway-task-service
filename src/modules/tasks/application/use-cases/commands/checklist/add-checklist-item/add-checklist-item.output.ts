import type { TaskView } from '../../../../projections/task/task-view.projection.js';

/**
 * Interface AddChecklistItemOutput
 *
 * @description
 * The task after the item was added, and the id of the item for the `Location` header.
 */
export interface AddChecklistItemOutput {
  // #region Properties
  /** The task, at its new version. */
  readonly task: TaskView;

  /** The id of the new item. */
  readonly checklistItemId: string;
  // #endregion
}

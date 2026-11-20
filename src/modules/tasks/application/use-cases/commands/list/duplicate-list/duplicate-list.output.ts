import type { PlacedList } from '../../../../models/placement/placed-list.model.js';

/** The newly created list and the number of copied live tasks. */
export interface DuplicateListOutput {
  // #region Properties
  /** The new list and its initial version. */
  readonly list: PlacedList;
  readonly taskCount: number;
  // #endregion
}

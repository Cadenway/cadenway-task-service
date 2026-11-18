import type { PlacedList } from './placed-list.model.js';
import type { PlacedSpace } from './placed-space.model.js';

/**
 * Interface ListPlacement
 *
 * @description
 * A list and its space as an actor sees them, where a task is or goes.
 */
export interface ListPlacement {
  // #region Properties
  /** The list. */
  readonly list: PlacedList;

  /** The space of the list. */
  readonly space: PlacedSpace;
  // #endregion
}

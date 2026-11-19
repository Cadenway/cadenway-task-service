import type { TrashPosition } from '../../models/trash/trash-position.model.js';
import type { TrashEntryView } from './trash-entry.projection.js';

/**
 * Interface TrashEntryPage
 *
 * @description
 * One page of the trash, the most recently deleted first (`TrashEntryPage` of
 * `openapi/internal/task-service.yaml`), with the position of its last entry when another page
 * follows and the count of every entry the actor may restore, on every page.
 */
export interface TrashEntryPage {
  // #region Properties
  /** The entries of the page. */
  readonly items: readonly TrashEntryView[];

  /** The position after which the next page starts, `null` on the last page. */
  readonly next: TrashPosition | null;

  /** Every entry the actor may restore ("2 éléments", the count of the sidebar). */
  readonly total: number;
  // #endregion
}

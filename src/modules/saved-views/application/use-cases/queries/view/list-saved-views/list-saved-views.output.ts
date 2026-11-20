import type { SavedView } from '../../../../../domain/aggregates/view/saved-view.entity.js';
import type { SavedViewPosition } from '../../../../models/view/saved-view-position.model.js';

/** Slice of the list and the last position if more views follow. */
export interface ListSavedViewsOutput {
  // #region Properties
  /** Rows of the current page, in list order. */
  readonly items: readonly SavedView[];

  /** Anchor for the next page, if any. */
  readonly next: SavedViewPosition | null;
  // #endregion
}

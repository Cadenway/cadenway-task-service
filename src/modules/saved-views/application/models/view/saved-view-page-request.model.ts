import type { SavedViewCollection } from './saved-view-collection.model.js';
import type { SavedViewPosition } from './saved-view-position.model.js';

/** Page request with its bounded size and optional starting point. */
export interface SavedViewPageRequest extends SavedViewCollection {
  // #region Properties
  /** Number of views requested. */
  readonly limit: number;

  /** Anchor of the preceding page, if any. */
  readonly after: SavedViewPosition | null;
  // #endregion
}

import type { SavedViewCollection } from './saved-view-collection.model.js';

/** UUID of a saved view within the requested list. */
export interface SavedViewItem extends SavedViewCollection {
  // #region Properties
  /** Saved-view identifier. */
  readonly viewId: string;
  // #endregion
}

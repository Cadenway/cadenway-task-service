import type { SavedViewItem } from './saved-view-item.model.js';

/** Version condition checked under the item write lock. */
export interface SavedViewWrite extends SavedViewItem {
  // #region Properties
  /** Allowed versions, or null for an unconditioned write. */
  readonly expectedVersions: readonly number[] | null;
  // #endregion
}

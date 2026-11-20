import type { SavedViewCaller } from './saved-view-caller.model.js';

/** Collection of views in one list and one tenant. */
export interface SavedViewCollection extends SavedViewCaller {
  // #region Properties
  /** Parent list identifier. */
  readonly listId: string;
  // #endregion
}

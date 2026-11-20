import type { SavedViewCaller } from './saved-view-caller.model.js';

/** Caller whose current organization membership has been verified. */
export interface SavedViewViewer extends SavedViewCaller {
  // #region Properties
  /** Role in the verified membership projection. */
  readonly role: 'owner' | 'admin' | 'member' | 'guest';
  // #endregion
}

import type { Caller } from '../caller/caller.model.js';
import type { SearchAccessMembership } from './search-access-membership.model.js';

/** The verified caller and the role from its matching local membership projection. */
export interface SearchAccessViewer extends Caller {
  // #region Properties
  /** Role used by the canonical Spaces policy. */
  readonly role: SearchAccessMembership['role'];
  // #endregion
}

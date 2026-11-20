import type { SearchProjectionKind } from './search-projection-kind.model.js';

/** Identifies a projection export and its optional current placement filters. */
export interface SearchProjectionScope {
  // #region Properties
  /** Resource kind to export. */
  readonly kind: SearchProjectionKind;
  readonly spaceId: string | null;
  readonly listId: string | null;
  // #endregion
}

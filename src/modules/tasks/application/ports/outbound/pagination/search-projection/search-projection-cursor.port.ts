import type { SearchProjectionBounds } from '../../../../models/search-projection/search-projection-bounds.model.js';
import type { SearchProjectionScope } from '../../../../models/search-projection/search-projection-scope.model.js';

/** Protects export bounds and binds them to the tenant and placement filters. */
export interface SearchProjectionCursor {
  // #region Methods
  /** Returns a continuation for the current export. */
  encode(
    organizationId: string,
    scope: SearchProjectionScope,
    bounds: SearchProjectionBounds,
  ): string;

  /** Returns null if the supplied cursor is invalid or belongs to a different export. */
  decode(
    organizationId: string,
    scope: SearchProjectionScope,
    cursor: string,
  ): SearchProjectionBounds | null;
  // #endregion
}

import type { SearchProjectionBounds } from '../../../../models/search-projection/search-projection-bounds.model.js';
import type { SearchProjectionKind } from '../../../../models/search-projection/search-projection-kind.model.js';
import type { SearchProjectionScope } from '../../../../models/search-projection/search-projection-scope.model.js';
import type { SearchProjectionRow } from '../../../../projections/search-projection/search-projection-row.projection.js';
import type { SearchProjectionSlice } from '../../../../projections/search-projection/search-projection-slice.projection.js';

/** Reads Task-owned source records in the caller's tenant snapshot. */
export interface SearchProjectionReader {
  // #region Methods
  /** Captures the fence on the first page and fetches at most one row beyond the requested limit. */
  page(
    organizationId: string,
    scope: SearchProjectionScope,
    bounds: SearchProjectionBounds | null,
    limit: number,
  ): Promise<SearchProjectionSlice>;

  /** Reads the same-tenant records among the selected keys, omitting missing records. */
  resolve(
    organizationId: string,
    kind: SearchProjectionKind,
    ids: readonly string[],
  ): Promise<readonly SearchProjectionRow[]>;
  // #endregion
}

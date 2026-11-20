import type { SearchProjection } from './search-projection.projection.js';

/** A searchable record and the immutable internal key used to page through it. */
export interface SearchProjectionEntry {
  // #region Properties
  /** Immutable row UUID used solely for pagination. */
  readonly rowId: string;
  readonly projection: SearchProjection;
  // #endregion
}

import type { SearchProjection } from './search-projection.projection.js';

/** A known row and its source version even when lifecycle or placement excludes it from search. */
export interface SearchProjectionRow {
  // #region Properties
  /** Immutable source row UUID. */
  readonly rowId: string;
  readonly id: string;
  readonly version: number;
  readonly projection: SearchProjection | null;
  // #endregion
}

import type { SearchProjectionEntry } from './search-projection-entry.projection.js';

/** The current active page, with the original export fence and one optional lookahead. */
export interface SearchProjectionSlice {
  // #region Properties
  /** Inclusive row fence, null if the first scan found no match. */
  readonly upperId: string | null;
  readonly entries: readonly SearchProjectionEntry[];
  // #endregion
}

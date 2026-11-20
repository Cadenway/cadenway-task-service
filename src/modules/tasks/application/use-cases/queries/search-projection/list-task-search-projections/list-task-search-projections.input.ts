import type { SearchProjectionScope } from '../../../../models/search-projection/search-projection-scope.model.js';

/** A projection export request bound to the verified tenant. */
export interface ListTaskSearchProjectionsInput {
  // #region Properties
  /** Organization from the verified caller. */
  readonly organizationId: string;
  readonly scope: SearchProjectionScope;
  readonly cursor: string | null;
  readonly limit: number;
  // #endregion
}

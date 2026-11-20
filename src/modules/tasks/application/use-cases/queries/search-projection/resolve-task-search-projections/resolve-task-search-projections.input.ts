import type { SearchProjectionKind } from '../../../../models/search-projection/search-projection-kind.model.js';

/** A bounded resource lookup for the verified tenant. */
export interface ResolveTaskSearchProjectionsInput {
  // #region Properties
  /** Organization from the verified caller. */
  readonly organizationId: string;
  readonly kind: SearchProjectionKind;
  readonly ids: readonly string[];
  // #endregion
}

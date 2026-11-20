import type { Caller } from '../../../../models/caller/caller.model.js';
import type { SearchAccessMembership } from '../../../../models/search-access/search-access-membership.model.js';
import type { SearchAccessPlacement } from '../../../../models/search-access/search-access-placement.model.js';

/** Verified caller, authoritative membership evidence and the candidates Search saw. */
export interface ResolveTaskSearchAccessInput extends Caller {
  // #region Properties
  /** Organization's membership evidence for the same verified actor and tenant. */
  readonly membership: SearchAccessMembership;

  /** Candidate selectors in response order, bounded and deduplicated by the boundary. */
  readonly candidates: readonly {
    readonly kind: SearchAccessPlacement['kind'];
    readonly id: string;
  }[];
  // #endregion
}

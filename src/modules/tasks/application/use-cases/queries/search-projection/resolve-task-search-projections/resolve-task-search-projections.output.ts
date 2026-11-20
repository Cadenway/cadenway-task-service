import type { SearchProjectionDecision } from '../../../../projections/search-projection/search-projection-decision.projection.js';

/** The complete ordered lookup or a refusal with no partial decisions. */
export type ResolveTaskSearchProjectionsOutput =
  | { readonly outcome: 'resolved'; readonly results: readonly SearchProjectionDecision[] }
  | { readonly outcome: 'duplicate-ids' | 'batch-too-large' };

import type { SearchProjection } from './search-projection.projection.js';

/** The current same-tenant decision for one input identifier. */
export type SearchProjectionDecision =
  | { readonly status: 'present'; readonly projection: SearchProjection }
  | { readonly status: 'absent'; readonly id: string; readonly version: number | null };

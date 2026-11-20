import type { SearchProjection } from '../../../../projections/search-projection/search-projection.projection.js';

/** A bounded page or a refusal that prevents advancing the export. */
export type ListTaskSearchProjectionsOutput =
  | {
      readonly outcome: 'page';
      readonly items: readonly SearchProjection[];
      readonly nextCursor: string | null;
    }
  | { readonly outcome: 'invalid-cursor' | 'unavailable' };

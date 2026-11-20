import type { SearchAccessPlacement } from '../../../../models/search-access/search-access-placement.model.js';

/** Current proofs for candidates the verified actor can read. */
export interface ResolveTaskSearchAccessOutput {
  // #region Properties
  /** Visible candidates in request order and the distinction for indirect space access. */
  readonly results: readonly (
    | Exclude<SearchAccessPlacement, { kind: 'space' }>
    | (Extract<SearchAccessPlacement, { kind: 'space' }> & { readonly directSpace: boolean })
  )[];
  // #endregion
}

import type { Caller } from '../caller/caller.model.js';
import type { SearchAccessMembership } from './search-access-membership.model.js';
import type { SearchAccessPlacement } from './search-access-placement.model.js';
import type { SearchAccessViewer } from './search-access-viewer.model.js';

/** Owner reads usable only within a common Search access snapshot. */
export interface SearchAccessStore {
  // #region Methods
  /** Selects the verified account's active membership using the local role policy. */
  membership(caller: Caller): Promise<SearchAccessMembership | null>;

  /** Reads the latest placement of active resources in the verified tenant. */
  placements(
    organizationId: string,
    kind: SearchAccessPlacement['kind'],
    ids: readonly string[],
  ): Promise<readonly SearchAccessPlacement[]>;

  /** Returns candidate lists the viewer may read, including via grants. */
  visibleLists(viewer: SearchAccessViewer, ids: readonly string[]): Promise<readonly string[]>;

  /** Returns candidate spaces accessible directly or through a readable list. */
  visibleSpaces(viewer: SearchAccessViewer, ids: readonly string[]): Promise<readonly string[]>;

  /** Returns candidate spaces on which the viewer holds a direct role. */
  directSpaces(viewer: SearchAccessViewer, ids: readonly string[]): Promise<readonly string[]>;
  // #endregion
}

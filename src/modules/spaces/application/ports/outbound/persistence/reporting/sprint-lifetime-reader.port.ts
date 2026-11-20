import type { SprintLifetimeCurrent } from '../../../../models/reporting/sprint-lifetime-current.model.js';
import type { SprintLifetimeFact } from '../../../../models/reporting/sprint-lifetime-fact.model.js';

/** Reads currently visible lists and raw history in the report tenant's snapshot. */
export interface SprintLifetimeReader {
  // #region Methods
  /** Reads only currently visible list records. */
  currentLists(
    organizationId: string,
    viewer: { readonly userId: string; readonly role: 'owner' | 'admin' | 'member' | 'guest' },
    listIds: readonly string[],
  ): Promise<readonly SprintLifetimeCurrent[]>;

  /** Includes late lazy baselines and filters ordinary facts by the pinned snapshot. */
  listFacts(
    organizationId: string,
    viewer: { readonly userId: string; readonly role: 'owner' | 'admin' | 'member' | 'guest' },
    listIds: readonly string[],
    until: Date,
    snapshot: string,
    after: bigint | null,
    limit: number,
  ): Promise<readonly SprintLifetimeFact[]>;
  // #endregion
}

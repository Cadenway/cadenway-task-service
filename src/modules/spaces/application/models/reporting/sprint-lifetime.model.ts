import type { SprintLifetimeInterval } from './sprint-lifetime-interval.model.js';

/** A currently readable sprint and the known and unknown portions of its history. */
export interface SprintLifetime {
  // #region Properties
  /** Current sprint identity and dates. */
  readonly listId: string;
  readonly spaceId: string;
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;

  /** Active intervals and intervals with unavailable history. */
  readonly intervals: readonly SprintLifetimeInterval[];
  readonly unknown: readonly SprintLifetimeInterval[];
  // #endregion
}

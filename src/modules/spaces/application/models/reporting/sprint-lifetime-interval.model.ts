/** A half-open period on the UTC timeline. */
export interface SprintLifetimeInterval {
  // #region Properties
  /** Inclusive start and exclusive end, or no end. */
  readonly startsAt: Date;
  readonly endsBefore: Date | null;
  // #endregion
}

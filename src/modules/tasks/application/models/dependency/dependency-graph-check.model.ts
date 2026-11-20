/** Invariants checked on the retained graph while it is locked for a write. */
export interface DependencyGraphCheck {
  // #region Properties
  /** Whether the same oriented pair is already present. */
  readonly duplicate: boolean;

  /** Whether the blocked task can already reach the blocker. */
  readonly cycle: boolean;

  /** Whether either task reached the incident-edge capacity. */
  readonly limitReached: boolean;
  // #endregion
}

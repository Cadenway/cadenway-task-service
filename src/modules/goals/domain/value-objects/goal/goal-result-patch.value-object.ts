/** Mutable result fields. Each progress member applies to its matching kind only. */
export interface GoalResultPatch {
  // #region Properties
  /** Supplied fields override the matching values. */
  readonly label?: string;
  readonly currentValue?: number;
  readonly checked?: boolean;
  // #endregion
}

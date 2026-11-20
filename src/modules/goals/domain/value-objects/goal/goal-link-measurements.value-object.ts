/** Measurements of the linked targets visible to the reader. An absent target is omitted. */
export interface GoalLinkMeasurements {
  // #region Properties
  /** Visible list populations and milestone states, keyed by their stable references. */
  readonly lists: ReadonlyMap<
    string,
    { readonly eligibleTaskCount: number; readonly doneTaskCount: number }
  >;
  readonly milestones: ReadonlyMap<string, boolean>;
  // #endregion
}

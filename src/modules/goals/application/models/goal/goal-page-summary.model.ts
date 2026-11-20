/** Summary over the complete visible quarter, independent of pagination. */
export interface GoalPageSummary {
  // #region Properties
  /** The members of this application contract. */
  readonly goalCount: number;
  readonly expectedProgressPercent: number;
  readonly averageProgressPercent: number;
  readonly onTrackOrAchievedCount: number;
  readonly achievedCount: number;
  readonly atRiskOrBehindCount: number;
  // #endregion
}

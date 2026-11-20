/** Eligible live root task counts for one list. */
export interface GoalListCount {
  // #region Properties
  /** Eligible tasks and their done subset. */
  readonly eligibleTaskCount: number;
  readonly doneTaskCount: number;
  // #endregion
}

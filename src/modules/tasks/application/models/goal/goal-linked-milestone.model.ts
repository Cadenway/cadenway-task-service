/** A readable candidate milestone as it stands in the current task transaction. */
export interface GoalLinkedMilestone {
  // #region Properties
  /** Stable task key and its current placement and status. */
  readonly key: string;
  readonly listId: string;
  readonly status: string;
  // #endregion
}

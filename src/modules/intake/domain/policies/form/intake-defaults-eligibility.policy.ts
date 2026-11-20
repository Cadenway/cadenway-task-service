/**
 * Authority supplied by the application for the exact configuration being checked. The statuses
 * are available for normal task creation, and the assignee set only needs to contain the proposed
 * eligible account. Both are resolved under the same lock as the action (P3c brief, decision 11).
 */
export interface IntakeDefaultsEligibility {
  // #region Properties
  /** Status keys accepted for ordinary task creation in the owning list. */
  readonly allowedStatuses: ReadonlySet<string>;

  /** Eligible accounts among the assignees being evaluated for this action. */
  readonly eligibleAssignees: ReadonlySet<string>;
  // #endregion
}

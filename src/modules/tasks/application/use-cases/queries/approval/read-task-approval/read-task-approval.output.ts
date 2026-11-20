/** The task state and eligible reviewers observed during an approval read. */
export interface ReadTaskApprovalOutput {
  // #region Properties
  /** Task identity, status, version, observation and visible approval audience. */
  readonly taskId: string;
  readonly taskKey: string;
  readonly organizationId: string;
  readonly listId: string;
  readonly spaceId: string;
  readonly milestone: boolean;
  readonly status: string;
  readonly version: number;
  readonly instant: Date;
  readonly eligibleReviewerIds: readonly string[];
  readonly watcherIds: readonly string[];
  // #endregion
}

/** The task state shared with an approval operation inside its tenant transaction. */
export interface ChangeTaskApprovalOutput {
  // #region Properties
  /** The authorized task, its current version and its current approval audience. */
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

/** Task data and eligible users resolved in the current tenant transaction. */
export interface ApprovalTaskContext {
  // #region Properties
  /** Members of this contract. */
  readonly organizationId: string;
  readonly taskId: string;
  readonly taskKey: string;
  readonly spaceId: string;
  readonly listId: string;
  readonly version: number;
  readonly status: string;
  readonly milestone: boolean;
  readonly instant: Date;
  readonly eligibleReviewerIds: readonly string[];
  readonly watcherIds: readonly string[];
  // #endregion
}

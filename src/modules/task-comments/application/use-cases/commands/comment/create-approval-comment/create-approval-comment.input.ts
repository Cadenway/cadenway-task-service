/** Locked task context and the approval's validated change request. */
export interface CreateApprovalCommentInput {
  // #region Properties
  /** Locked task and comment context. */
  readonly organizationId: string;
  readonly taskId: string;
  readonly taskKey: string;
  readonly taskVersion: number;
  readonly spaceId: string;
  readonly listId: string;
  readonly watcherIds: readonly string[];
  readonly commentId: string;
  readonly actorUserId: string;
  readonly body: string;
  // #endregion
}

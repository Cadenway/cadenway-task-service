/** The task and actor of an approval write. */
export interface ChangeTaskApprovalInput {
  // #region Properties
  /** The tenant, acting member, task key and accepted task versions. */
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly taskKey: string;
  readonly expectedVersions: readonly number[] | null;

  /** Reviewer IDs from the request, in addition to those returned by discovery. */
  readonly reviewerUserIds: readonly string[];
  // #endregion
}

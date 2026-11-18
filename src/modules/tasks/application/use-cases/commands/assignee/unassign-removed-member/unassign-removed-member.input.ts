/**
 * Interface UnassignRemovedMemberInput
 *
 * @description
 * One batch of the unassignment of a member who left an organization, as the clean-up job of
 * member-lifecycle asks for it. There is no actor: the change is made by task-service itself.
 */
export interface UnassignRemovedMemberInput {
  // #region Properties
  /** The organization of the job, in lower case, the one of its organization context. */
  readonly organizationId: string;

  /** The account of the member who left, in lower case. */
  readonly userId: string;

  /**
   * The last task id of the previous batch of the same attempt (`lastTaskId`), `null` for the
   * first batch: the batch starts after it.
   */
  readonly afterTaskId: string | null;
  // #endregion
}

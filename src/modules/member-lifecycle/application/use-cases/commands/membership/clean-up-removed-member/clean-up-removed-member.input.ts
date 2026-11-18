/**
 * Interface CleanUpRemovedMemberInput
 *
 * @description
 * The member who left an organization, as the clean-up job carries them. There is no actor: the
 * changes are made by task-service itself.
 */
export interface CleanUpRemovedMemberInput {
  // #region Properties
  /** The organization of the job, in lower case, the one of its organization context. */
  readonly organizationId: string;

  /** The account of the member who left, in lower case. */
  readonly userId: string;

  /**
   * Aborted when the attempt can no longer succeed (expired, or abandoned at shutdown): the use
   * case starts no batch after it, and rejects with its reason.
   */
  readonly signal?: AbortSignal;
  // #endregion
}

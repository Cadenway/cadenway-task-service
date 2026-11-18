/**
 * Interface UnassignRemovedMemberInput
 *
 * @description
 * The member who left an organization, as the unassignment job carries them. There is no actor:
 * the change is made by task-service itself.
 */
export interface UnassignRemovedMemberInput {
  // #region Properties
  /** The organization of the job, the one of its organization context. */
  readonly organizationId: string;

  /** The account of the member who left. */
  readonly userId: string;

  /**
   * Aborted when the attempt can no longer succeed (expired, or abandoned at shutdown): the use
   * case starts no batch after it, and rejects with its reason.
   */
  readonly signal?: AbortSignal;
  // #endregion
}

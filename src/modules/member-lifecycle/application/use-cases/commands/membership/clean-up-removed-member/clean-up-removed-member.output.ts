/**
 * Interface CleanUpRemovedMemberOutput
 *
 * @description
 * How the clean-up after a former member ended, with counts only.
 */
export interface CleanUpRemovedMemberOutput {
  // #region Properties
  /**
   * `completed` once no private space is left to hand over and no task is left assigned to the
   * account; `member-again` when the copy holds the account as a member again, so the job stopped
   * for good and left the remaining spaces and tasks as they are.
   */
  readonly outcome: 'completed' | 'member-again';

  /** The private spaces this run gave to the owner of the organization. */
  readonly spacesHandedOver: number;

  /** The private spaces this run left awaiting an owner, because the copy does not hold one. */
  readonly spacesAwaitingOwner: number;

  /** The tasks this run removed the account from. */
  readonly tasksUnassigned: number;

  /** The batches this run committed, spaces and tasks together. */
  readonly batches: number;
  // #endregion
}

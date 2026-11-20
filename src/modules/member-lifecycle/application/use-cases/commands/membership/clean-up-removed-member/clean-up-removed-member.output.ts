/**
 * Interface CleanUpRemovedMemberOutput
 *
 * @description
 * How the clean-up after a former member ended, with counts only.
 */
export interface CleanUpRemovedMemberOutput {
  // #region Properties
  /**
   * `completed` once no private space is left to hand over, no grant is left, no access request is
   * left pending and no task assignment or watcher override is left for the account.
   * `member-again` means the account rejoined and the job stopped.
   */
  readonly outcome: 'completed' | 'member-again';

  /** The private spaces this run gave to the owner of the organization. */
  readonly spacesHandedOver: number;

  /** The private spaces this run left awaiting an owner, because the copy does not hold one. */
  readonly spacesAwaitingOwner: number;

  /** The grants of spaces and lists this run removed. */
  readonly grantsRemoved: number;

  /** The access requests this run dropped, pending or answered. */
  readonly requestsDropped: number;

  /** The tasks this run removed the account from. */
  readonly tasksUnassigned: number;

  /** The explicit task watcher overrides removed for the account. */
  readonly watcherOverridesRemoved: number;

  /**
   * The batches this run committed that found something to process, across all steps;
   * the closing call of each step, which finds nothing left, and a call answered `member-again`
   * are not counted.
   */
  readonly batches: number;
  // #endregion
}

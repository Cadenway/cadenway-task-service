/**
 * Interface GetListCountsInput
 *
 * @description
 * The list whose counts are read.
 */
export interface GetListCountsInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The list. */
  readonly listId: string;

  /** The date of the caller, `YYYY-MM-DD`: a task is late when it is due before it. */
  readonly today: string;
  // #endregion
}

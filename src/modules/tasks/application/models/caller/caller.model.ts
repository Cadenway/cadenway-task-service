/**
 * Interface Caller
 *
 * @description
 * The organization and the user the verified internal token acts for, the two members every use
 * case of the tasks module takes first.
 */
export interface Caller {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;
  // #endregion
}

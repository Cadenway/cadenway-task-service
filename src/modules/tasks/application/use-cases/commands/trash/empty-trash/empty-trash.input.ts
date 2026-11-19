/**
 * Interface EmptyTrashInput
 *
 * @description
 * "Vider la corbeille": every entry the actor may restore, handed to the purge.
 */
export interface EmptyTrashInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;
  // #endregion
}

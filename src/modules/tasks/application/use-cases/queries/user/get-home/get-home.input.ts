/**
 * Interface GetHomeInput
 *
 * @description
 * The task part of "Accueil" of the actor.
 */
export interface GetHomeInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The `userId` of the path, which must be the actor. */
  readonly userId: string;

  /** The date of the caller, `YYYY-MM-DD`: the late and due tasks and the current sprints. */
  readonly today: string;
  // #endregion
}

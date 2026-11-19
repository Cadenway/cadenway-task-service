/**
 * Interface CheckTaskAccessInput
 *
 * @description
 * The task whose access the realtime gateway checks, and the person of the socket.
 */
export interface CheckTaskAccessInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token, the person of the socket. */
  readonly actorUserId: string;

  /** The key of the task. */
  readonly taskKey: string;
  // #endregion
}

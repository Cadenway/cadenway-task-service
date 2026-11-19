/**
 * Interface CheckListAccessInput
 *
 * @description
 * The list a socket of the realtime gateway wants to join, and the person of the socket.
 */
export interface CheckListAccessInput {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the verified internal token.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property actorUserId
   *
   * @description
   * The account of the actor of the internal token, the person of the socket.
   *
   * @type {string}
   * @readonly
   */
  readonly actorUserId: string;

  /**
   * Property listId
   *
   * @description
   * The id of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly listId: string;
  // #endregion
}

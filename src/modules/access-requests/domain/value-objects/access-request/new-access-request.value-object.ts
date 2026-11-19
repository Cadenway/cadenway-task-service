import type { AccessRequestTarget } from './access-request-target.value-object.js';

/**
 * Interface NewAccessRequest
 *
 * @description
 * A request for access as the application resolved it, before it is stored: the target, where it
 * is, the requester and the message as typed. `AccessRequest.ask` checks and normalizes it.
 */
export interface NewAccessRequest {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the requester and of the target.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property target
   *
   * @description
   * What is asked for.
   *
   * @type {AccessRequestTarget}
   * @readonly
   */
  readonly target: AccessRequestTarget;

  /**
   * Property spaceId
   *
   * @description
   * The space asked for, or the space of the list or of the task.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;

  /**
   * Property listId
   *
   * @description
   * The list asked for, or the list the task asked for is in now; `null` for a space.
   *
   * @type {string | null}
   * @readonly
   */
  readonly listId: string | null;

  /**
   * Property taskId
   *
   * @description
   * The task asked for; `null` for a space or a list.
   *
   * @type {string | null}
   * @readonly
   */
  readonly taskId: string | null;

  /**
   * Property taskKey
   *
   * @description
   * The key of the task asked for (`CAD-482`); `null` for a space or a list.
   *
   * @type {string | null}
   * @readonly
   */
  readonly taskKey: string | null;

  /**
   * Property requesterUserId
   *
   * @description
   * The account that asks.
   *
   * @type {string}
   * @readonly
   */
  readonly requesterUserId: string;

  /**
   * Property message
   *
   * @description
   * "Message pour Léa (facultatif)" as typed, `null` for none.
   *
   * @type {string | null}
   * @readonly
   */
  readonly message: string | null;
  // #endregion
}

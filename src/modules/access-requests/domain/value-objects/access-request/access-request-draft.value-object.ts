import type { AccessRequestTarget } from './access-request-target.value-object.js';

/**
 * Interface AccessRequestDraft
 *
 * @description
 * A checked request for access, ready to be stored `pending`: PostgreSQL gives its id and its
 * creation instant. `targetId` is the id of the space, the list or the task asked for, which the
 * unique pending index keys together with the requester.
 */
export interface AccessRequestDraft {
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
   * Property targetId
   *
   * @description
   * The id of the space, the list or the task asked for.
   *
   * @type {string}
   * @readonly
   */
  readonly targetId: string;

  /**
   * Property spaceId
   *
   * @description
   * The space of the target.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;

  /**
   * Property listId
   *
   * @description
   * The list of a list or task target; `null` for a space.
   *
   * @type {string | null}
   * @readonly
   */
  readonly listId: string | null;

  /**
   * Property taskId
   *
   * @description
   * The task of a task target; `null` otherwise.
   *
   * @type {string | null}
   * @readonly
   */
  readonly taskId: string | null;

  /**
   * Property taskKey
   *
   * @description
   * The key of the task of a task target; `null` otherwise.
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
   * The message, trimmed, 500 characters at most, `null` for none.
   *
   * @type {string | null}
   * @readonly
   */
  readonly message: string | null;
  // #endregion
}

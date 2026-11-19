/**
 * Interface RequestedTarget
 *
 * @description
 * The names of a stored request's target and the owner of its space, which the
 * `…access-requested.v1` events carry so that the notice names them without calling back
 * (`asyncapi/task-service.yaml`).
 */
export interface RequestedTarget {
  // #region Properties
  /**
   * Property spaceName
   *
   * @description
   * Name of the space, or of the space of the list or the task.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceName: string;

  /**
   * Property spaceOwnerUserId
   *
   * @description
   * Account of the owner of that space, whom to tell.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceOwnerUserId: string;

  /**
   * Property listName
   *
   * @description
   * Name of the list, or of the list of the task; `null` for a space.
   *
   * @type {string | null}
   * @readonly
   */
  readonly listName: string | null;

  /**
   * Property taskName
   *
   * @description
   * Name of the task; `null` for a space or a list.
   *
   * @type {string | null}
   * @readonly
   */
  readonly taskName: string | null;
  // #endregion
}

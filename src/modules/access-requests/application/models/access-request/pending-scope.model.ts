/**
 * Interface PendingScope
 *
 * @description
 * Which pending requests a member reads ("List the pending access requests" of
 * `openapi/public/access.yaml`): the space requests of the spaces they manage and the list requests
 * of the lists they have `edit` on, narrowed by the `spaceId` and `listId` filters on their stored
 * space and list (a list never changes space), and the task requests named in `taskIds`, whose
 * task is now in a list the member has `edit` on, the filters already applied to the current
 * place of the task.
 */
export interface PendingScope {
  // #region Properties
  /**
   * Property spaceIds
   *
   * @description
   * The spaces the member manages, whose space requests they answer.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly spaceIds: readonly string[];

  /**
   * Property listIds
   *
   * @description
   * The lists the member has `edit` on, whose list requests they answer.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly listIds: readonly string[];

  /**
   * Property taskIds
   *
   * @description
   * The tasks whose pending task requests the member answers: tasks now in a list they have `edit`
   * on, and within the filters.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly taskIds: readonly string[];

  /**
   * Property spaceId
   *
   * @description
   * Keeps the space and list requests of this space; `null` for no filter. Task requests are
   * filtered on the current space of their task, in `taskIds`.
   *
   * @type {string | null}
   * @readonly
   */
  readonly spaceId: string | null;

  /**
   * Property listId
   *
   * @description
   * Keeps the list requests of this list; `null` for no filter. Task requests are filtered on the
   * current list of their task, in `taskIds`.
   *
   * @type {string | null}
   * @readonly
   */
  readonly listId: string | null;
  // #endregion
}

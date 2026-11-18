/**
 * Interface TaskPlacement
 *
 * @description
 * Where a task is: a list and the space of that list (`listId` and `spaceId` of `Task`,
 * `openapi/internal/task-service.yaml:2224-2229` and 2336-2343). The application resolves it from
 * a list the caller sees; the domain trusts that `spaceId` is the space of `listId`.
 */
export interface TaskPlacement {
  // #region Properties
  /**
   * Property listId
   *
   * @description
   * Id of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly listId: string;

  /**
   * Property spaceId
   *
   * @description
   * Id of the space of the list, which may not be the space of the prefix of the key.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;
  // #endregion
}

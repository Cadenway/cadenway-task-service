/**
 * Interface RequestPlacement
 *
 * @description
 * Where the target of a request is now, which decides who answers it, what an approval grants and
 * what its answer and its `…access-request-decided.v1` name: the stored space of a space request,
 * the stored list and space of a list request (a list never changes space), and the current list
 * and space of the task of a task request.
 */
export interface RequestPlacement {
  // #region Properties
  /**
   * Property spaceId
   *
   * @description
   * The space of the target now.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;

  /**
   * Property listId
   *
   * @description
   * The list of a list request, or the current list of the task of a task request; `null` for a
   * space request.
   *
   * @type {string | null}
   * @readonly
   */
  readonly listId: string | null;
  // #endregion
}

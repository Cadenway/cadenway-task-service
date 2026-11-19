/**
 * Interface HoldListInput
 *
 * @description
 * The list another module holds while a task joins it (a creation of a top-level task, a move to
 * another list) or while the deletion job moves its tasks to the trash.
 */
export interface HoldListInput {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the context, the one of the tenant transaction the use case joins.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

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

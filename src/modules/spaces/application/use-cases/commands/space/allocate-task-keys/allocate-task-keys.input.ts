/**
 * Interface AllocateTaskKeysInput
 *
 * @description
 * How many task numbers a space hands out to the tasks a caller creates in its transaction. The
 * caller already checked that the actor sees the space (`FindVisibleList`).
 */
export interface AllocateTaskKeysInput {
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
   * Property spaceId
   *
   * @description
   * The space the tasks are created in.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;

  /**
   * Property count
   *
   * @description
   * How many consecutive numbers: a whole number from 1 to 26, a task and its 25 subtasks at most.
   *
   * @type {number}
   * @readonly
   */
  readonly count: number;
  // #endregion
}

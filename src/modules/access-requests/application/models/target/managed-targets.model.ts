/**
 * Interface ManagedTargets
 *
 * @description
 * What a member answers access requests for (decision 3 of P3b-1), as the spaces module lists it.
 */
export interface ManagedTargets {
  // #region Properties
  /**
   * Property spaceIds
   *
   * @description
   * The spaces the member manages (`callerCanManage`).
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly spaceIds: readonly string[];

  /**
   * Property listIds
   *
   * @description
   * The lists the member has `edit` on.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly listIds: readonly string[];
  // #endregion
}

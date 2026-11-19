/**
 * Interface PurgeDeletedListInput
 *
 * @description
 * A deleted list another module erases once no task of it is left (the erasure of the trash of the
 * tasks module, the deletion job of the deletion-lifecycle module through it).
 */
export interface PurgeDeletedListInput {
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

/**
 * Interface ListDeletedSpaceListsInput
 *
 * @description
 * A deleted space whose lists the deletion job walks.
 */
export interface ListDeletedSpaceListsInput {
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
   * The id of the space.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;
  // #endregion
}

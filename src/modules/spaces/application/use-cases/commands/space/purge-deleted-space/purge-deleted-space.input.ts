/**
 * Interface PurgeDeletedSpaceInput
 *
 * @description
 * A deleted space the deletion job erases once none of its lists is left.
 */
export interface PurgeDeletedSpaceInput {
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

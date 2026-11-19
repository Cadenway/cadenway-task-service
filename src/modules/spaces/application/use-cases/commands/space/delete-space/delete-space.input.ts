/**
 * Interface DeleteSpaceInput
 *
 * @description
 * A deletion of a space (`DELETE /internal/v1/spaces/{spaceId}`).
 */
export interface DeleteSpaceInput {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the verified internal token.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property actorUserId
   *
   * @description
   * The account of the actor of the internal token.
   *
   * @type {string}
   * @readonly
   */
  readonly actorUserId: string;

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

  /**
   * Property expectedVersions
   *
   * @description
   * The versions `If-Match` names, `null` without the header or with `*`.
   *
   * @type {readonly number[] | null}
   * @readonly
   */
  readonly expectedVersions: readonly number[] | null;
  // #endregion
}

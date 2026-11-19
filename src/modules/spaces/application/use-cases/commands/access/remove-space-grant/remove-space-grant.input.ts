/**
 * Interface RemoveSpaceGrantInput
 *
 * @description
 * The grant of a person to remove from a space
 * (`DELETE /internal/v1/spaces/{spaceId}/grants/{userId}`).
 */
export interface RemoveSpaceGrantInput {
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
   * Property userId
   *
   * @description
   * The account of the person whose grant to remove, lower-cased.
   *
   * @type {string}
   * @readonly
   */
  readonly userId: string;

  /**
   * Property expectedVersions
   *
   * @description
   * The versions of the space `If-Match` accepts, `null` without the header.
   *
   * @type {readonly number[] | null}
   * @readonly
   */
  readonly expectedVersions: readonly number[] | null;
  // #endregion
}

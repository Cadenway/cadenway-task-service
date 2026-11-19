/**
 * Interface ArchiveListInput
 *
 * @description
 * An archive of a list or a sprint (`POST /internal/v1/lists/{listId}/archive`).
 */
export interface ArchiveListInput {
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
   * Property listId
   *
   * @description
   * The id of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly listId: string;

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

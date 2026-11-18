import type { SpacePatch } from '../../../../../domain/value-objects/space/space-patch.value-object.js';

/**
 * Interface UpdateSpaceInput
 *
 * @description
 * A JSON Merge Patch of a space.
 */
export interface UpdateSpaceInput {
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

  /**
   * Property patch
   *
   * @description
   * The members to change; an empty patch changes nothing.
   *
   * @type {SpacePatch}
   * @readonly
   */
  readonly patch: SpacePatch;
  // #endregion
}

import type { SpaceDraft } from './space-draft.value-object.js';

/**
 * Interface SpaceState
 *
 * @description
 * A stored space (`Space` of `openapi/internal/task-service.yaml`): the members of its draft, what
 * PostgreSQL assigned, and the version that orders its changes.
 */
export interface SpaceState extends SpaceDraft {
  // #region Properties
  /**
   * Property id
   *
   * @description
   * Id of the space.
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;

  /**
   * Property createdAt
   *
   * @description
   * When the space was created.
   *
   * @type {Date}
   * @readonly
   */
  readonly createdAt: Date;

  /**
   * Property version
   *
   * @description
   * Version of the space, a positive integer: 1 at its creation, one more at each change that
   * changes something; also sent as `ETag`.
   *
   * @type {number}
   * @readonly
   */
  readonly version: number;
  // #endregion
}

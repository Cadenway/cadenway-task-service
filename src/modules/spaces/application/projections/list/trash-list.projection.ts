/**
 * Interface TrashList
 *
 * @description
 * A list as the trash reads it for another module (the `list` of `TrashEntry`, `ListRef` of
 * `openapi/internal/task-service.yaml`): live, archived or deleted, with its name and its state as
 * they are now. Primitive and readonly members only, so that no type of the domain of this module
 * crosses the public entry points.
 */
export interface TrashList {
  // #region Properties
  /**
   * Property id
   *
   * @description
   * Id of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;

  /**
   * Property spaceId
   *
   * @description
   * Id of the space of the list.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;

  /**
   * Property name
   *
   * @description
   * Name of the list, as it is now.
   *
   * @type {string}
   * @readonly
   */
  readonly name: string;

  /**
   * Property state
   *
   * @description
   * `deleted` when the list or its space is deleted, else `archived` when the list is archived,
   * else `active` (`ListStateValue` of `openapi/internal/task-service.yaml`).
   *
   * @type {'active' | 'archived' | 'deleted'}
   * @readonly
   */
  readonly state: 'active' | 'archived' | 'deleted';
  // #endregion
}

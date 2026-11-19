/**
 * Interface RequestActor
 *
 * @description
 * Who answered a request for access (`decidedBy`, the `Actor` of
 * `openapi/internal/task-service.yaml`): in this version a member who manages its target, acting
 * through the API gateway (`user`, `id` the account). The other actor types of the contract are
 * kept when a stored row carries them.
 */
export interface RequestActor {
  // #region Properties
  /**
   * Property type
   *
   * @description
   * Kind of actor.
   *
   * @type {'user' | 'automation' | 'git' | 'system'}
   * @readonly
   */
  readonly type: 'user' | 'automation' | 'git' | 'system';

  /**
   * Property id
   *
   * @description
   * Id of the account, of the rule or of the service.
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;
  // #endregion
}

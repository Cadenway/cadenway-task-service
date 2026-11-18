/**
 * Interface EventActor
 *
 * @description
 * Who caused a change, as its event carries it (`Actor` of `asyncapi/task-service.yaml`): the
 * member acting through the API gateway, or task-service itself (`{ type: 'system', id:
 * 'task-service' }`) when the owner of a private space leaves the organization.
 */
export interface EventActor {
  // #region Properties
  /**
   * Property type
   *
   * @description
   * Kind of actor.
   *
   * @type {'user' | 'system'}
   * @readonly
   */
  readonly type: 'user' | 'system';

  /**
   * Property id
   *
   * @description
   * Id of the account, or `task-service`.
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;
  // #endregion
}

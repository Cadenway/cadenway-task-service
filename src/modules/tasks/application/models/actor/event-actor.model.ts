/**
 * Interface EventActor
 *
 * @description
 * Who caused a change, as its event carries it (`Actor` of `asyncapi/task-service.yaml`): the
 * member acting through the API gateway, or task-service itself (`{ type: 'system', id:
 * 'task-service' }`) when a member leaves the organization.
 */
export interface EventActor {
  // #region Properties
  /** Kind of actor. */
  readonly type: 'user' | 'system';

  /** Id of the account, or `task-service`. */
  readonly id: string;
  // #endregion
}

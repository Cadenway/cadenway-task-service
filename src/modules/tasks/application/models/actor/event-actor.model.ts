/**
 * Interface EventActor
 *
 * @description
 * Who caused a change, as its event carries it (`Actor` of `asyncapi/task-service.yaml`): the
 * member acting through the API gateway, or task-service itself (`{ type: 'system', id:
 * 'task-service' }`) when a member leaves the organization or the daily purge erases the trash.
 * A trash entry keeps the actor of its deletion and of its hand-over to the purge as stored, so
 * the events of a job carry any of the four types of `Actor`.
 */
export interface EventActor {
  // #region Properties
  /** Kind of actor. */
  readonly type: 'user' | 'automation' | 'git' | 'system';

  /** Id of the account, or `task-service`. */
  readonly id: string;
  // #endregion
}

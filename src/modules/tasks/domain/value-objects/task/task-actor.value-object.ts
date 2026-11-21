/**
 * Interface TaskActor
 *
 * @description
 * Who made a change of a task or an activity entry (`Actor` of
 * `openapi/internal/task-service.yaml:3374-3397`): a person (`user`, `id` is the account), an
 * automation rule (`automation`), the Git integration (`git`) or a service (`system`, `id` is its
 * name, `task-service` when a removed member leaves the assignees,
 * `openapi/internal/task-service.yaml:66-69`).
 */
export interface TaskActor {
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
   * Id of the account, the automation rule, the Git integration or the service; never empty.
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;

  /** Verified provider recorded for a Git actor in activity. Old entries may omit it. */
  readonly provider?: 'github' | 'gitlab';
  // #endregion
}

/** Providers Task accepts as verified Git activity provenance. */
export const GIT_ACTOR_PROVIDERS: readonly NonNullable<TaskActor['provider']>[] = Object.freeze([
  'github',
  'gitlab',
]);

/**
 * Constant ACTOR_TYPES
 *
 * @description
 * The actor types of `Actor` today (`openapi/internal/task-service.yaml:3386-3392`), to refuse any
 * other in a stored state.
 *
 * @type {readonly TaskActor['type'][]}
 */
export const ACTOR_TYPES: readonly TaskActor['type'][] = Object.freeze([
  'user',
  'automation',
  'git',
  'system',
]);

/**
 * Constant TASK_SERVICE_ACTOR
 *
 * @description
 * The actor of the changes task-service makes itself, when a removed member leaves the assignees
 * of every task (`openapi/internal/task-service.yaml:66-69`; `asyncapi/task-service.yaml:918-921`).
 *
 * @type {TaskActor}
 */
export const TASK_SERVICE_ACTOR: TaskActor = Object.freeze({ type: 'system', id: 'task-service' });

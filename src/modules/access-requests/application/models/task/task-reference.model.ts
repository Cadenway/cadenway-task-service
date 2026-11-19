/**
 * Interface TaskReference
 *
 * @description
 * A task as the tasks module describes it to this module: its id, key, name and status as they
 * are now, and the list and space it is in, whatever the member sees.
 */
export interface TaskReference {
  // #region Properties
  /**
   * Property id
   *
   * @description
   * Id of the task.
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;

  /**
   * Property key
   *
   * @description
   * Key of the task (`DIR-12`).
   *
   * @type {string}
   * @readonly
   */
  readonly key: string;

  /**
   * Property name
   *
   * @description
   * Name of the task.
   *
   * @type {string}
   * @readonly
   */
  readonly name: string;

  /**
   * Property status
   *
   * @description
   * Status key of the task.
   *
   * @type {'triage' | 'backlog' | 'todo' | 'progress' | 'review' | 'testing' | 'waiting' | 'blocked' | 'done' | 'cancelled'}
   * @readonly
   */
  readonly status:
    | 'triage'
    | 'backlog'
    | 'todo'
    | 'progress'
    | 'review'
    | 'testing'
    | 'waiting'
    | 'blocked'
    | 'done'
    | 'cancelled';

  /**
   * Property listId
   *
   * @description
   * The list the task is in now.
   *
   * @type {string}
   * @readonly
   */
  readonly listId: string;

  /**
   * Property spaceId
   *
   * @description
   * The space of that list.
   *
   * @type {string}
   * @readonly
   */
  readonly spaceId: string;
  // #endregion
}

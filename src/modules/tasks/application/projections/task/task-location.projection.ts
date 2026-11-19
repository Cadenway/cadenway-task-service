/**
 * Interface TaskLocation
 *
 * @description
 * A task as another module names it (an access request for a task): its id, key, name and
 * status as they are now, and where it is. Read whatever the caller sees: the caller decides.
 */
export interface TaskLocation {
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
   * Key of the task (`CAD-482`).
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
   * The list the task is in.
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

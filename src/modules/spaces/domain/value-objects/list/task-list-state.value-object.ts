import type { TaskListDraft } from './task-list-draft.value-object.js';

/**
 * Interface TaskListState
 *
 * @description
 * A stored list or sprint (`TaskList` of `openapi/internal/task-service.yaml`): the members of its
 * draft, what PostgreSQL assigned, and the version that orders its changes.
 */
export interface TaskListState extends TaskListDraft {
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
   * Property createdAt
   *
   * @description
   * When the list was created; lists keep the order of their creation.
   *
   * @type {Date}
   * @readonly
   */
  readonly createdAt: Date;

  /**
   * Property version
   *
   * @description
   * Version of the list, a positive integer: 1 at its creation, one more at each change that
   * changes something; also sent as `ETag`.
   *
   * @type {number}
   * @readonly
   */
  readonly version: number;
  // #endregion
}

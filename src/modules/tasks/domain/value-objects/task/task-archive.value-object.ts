import type { TaskActor } from './task-actor.value-object.js';

/**
 * Interface TaskArchive
 *
 * @description
 * The archive a task belongs to ("Tasks" of `openapi/public/archives.yaml`; `archivedAt` and
 * `archivedBy` of `Task`, `openapi/internal/task-service.yaml`): when and by whom the subtree it
 * belongs to was archived, and the task that subtree was archived from, its root. Every task of
 * one archive shares the three members; a task without archive is live.
 */
export interface TaskArchive {
  // #region Properties
  /**
   * Property at
   *
   * @description
   * When the archive was committed, the transaction instant (`archivedAt`).
   *
   * @type {Date}
   * @readonly
   */
  readonly at: Date;

  /**
   * Property by
   *
   * @description
   * Who archived it (`archivedBy`).
   *
   * @type {TaskActor}
   * @readonly
   */
  readonly by: TaskActor;

  /**
   * Property rootId
   *
   * @description
   * Id of the root of the archive, the task it was made from; the id of the task itself for the
   * root.
   *
   * @type {string}
   * @readonly
   */
  readonly rootId: string;
  // #endregion
}

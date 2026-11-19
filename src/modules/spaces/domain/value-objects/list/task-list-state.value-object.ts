import type { ListActor } from './list-actor.value-object.js';
import type { TaskListDraft } from './task-list-draft.value-object.js';

/**
 * Interface TaskListState
 *
 * @description
 * A stored list or sprint (`TaskList` of `openapi/internal/task-service.yaml`): the members of its
 * draft, what PostgreSQL assigned, its archive ("Lists" of `openapi/public/archives.yaml`) and the
 * version that orders its changes.
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
   * When the list was created; lists keep the order of their creation until one is restored from
   * the archives.
   *
   * @type {Date}
   * @readonly
   */
  readonly createdAt: Date;

  /**
   * Property archivedAt
   *
   * @description
   * When the list was archived ("archivée le 3 nov."), the instant of the transaction of the
   * archive; `null` for a live list. Set together with `archivedBy`.
   *
   * @type {Date | null}
   * @readonly
   */
  readonly archivedAt: Date | null;

  /**
   * Property archivedBy
   *
   * @description
   * Who archived the list; `null` for a live list. Set together with `archivedAt`.
   *
   * @type {ListActor | null}
   * @readonly
   */
  readonly archivedBy: ListActor | null;

  /**
   * Property restoredAt
   *
   * @description
   * When the list last came back from the archives, `null` when it never did: a restored list goes
   * to the end of its space, which orders its lists by this instant or, without one, by
   * `createdAt`.
   *
   * @type {Date | null}
   * @readonly
   */
  readonly restoredAt: Date | null;

  /**
   * Property version
   *
   * @description
   * Version of the list, a positive integer: 1 at its creation, one more at each change that
   * changes something (an archive and a restoration included); also sent as `ETag`.
   *
   * @type {number}
   * @readonly
   */
  readonly version: number;
  // #endregion
}

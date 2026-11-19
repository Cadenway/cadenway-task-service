import type { ListActor } from './list-actor.value-object.js';
import type { TaskListDraft } from './task-list-draft.value-object.js';

/**
 * Interface TaskListState
 *
 * @description
 * A stored list or sprint (`TaskList` of `openapi/internal/task-service.yaml`): the members of its
 * draft, what PostgreSQL assigned, its archive ("Lists" of `openapi/public/archives.yaml`), its
 * tombstone ("Deletion" of `openapi/public/lists.yaml`) and the version that orders its changes.
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
   * When the list last came back from the archives or from the trash, `null` when it never did: a
   * restored list goes to the end of its space, which orders its lists by this instant or, without
   * one, by `createdAt`.
   *
   * @type {Date | null}
   * @readonly
   */
  readonly restoredAt: Date | null;

  /**
   * Property deletedAt
   *
   * @description
   * When the list was deleted ("Supprimer la liste"), on its own or with its space, the instant of
   * the transaction of the deletion; `null` for a list that is not. A deleted list is a tombstone
   * that nobody sees, kept with its settings and its grants until the last trash entry of its
   * tasks is erased. Set together with `deletedBy`.
   *
   * @type {Date | null}
   * @readonly
   */
  readonly deletedAt: Date | null;

  /**
   * Property deletedBy
   *
   * @description
   * Who deleted the list, or its space; `null` for a list that is not deleted. Set together with
   * `deletedAt`.
   *
   * @type {ListActor | null}
   * @readonly
   */
  readonly deletedBy: ListActor | null;

  /**
   * Property version
   *
   * @description
   * Version of the list, a positive integer: 1 at its creation, one more at each change that
   * changes something (an archive, a restoration, a deletion on its own and a restoration from the
   * trash included; a deletion with its space keeps it); also sent as `ETag`.
   *
   * @type {number}
   * @readonly
   */
  readonly version: number;
  // #endregion
}

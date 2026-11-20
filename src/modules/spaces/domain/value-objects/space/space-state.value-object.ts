import type { ListActor } from '../list/list-actor.value-object.js';
import type { SpaceDraft } from './space-draft.value-object.js';

/**
 * Interface SpaceState
 *
 * @description
 * A stored space (`Space` of `openapi/internal/task-service.yaml`): the members of its draft, what
 * PostgreSQL assigned, its tombstone ("Deletion" of `openapi/public/spaces.yaml`) and the version
 * that orders its changes.
 */
export interface SpaceState extends SpaceDraft {
  // #region Properties
  /**
   * Property id
   *
   * @description
   * Id of the space.
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;

  /**
   * Property createdAt
   *
   * @description
   * When the space was created.
   *
   * @type {Date}
   * @readonly
   */
  readonly createdAt: Date;

  /**
   * Property deletedAt
   *
   * @description
   * When the space was deleted ("Supprimer l’espace"), the instant of the transaction of the
   * deletion; `null` for a space that is not. A deleted space is a tombstone that nobody sees,
   * kept with its lists, its settings and its grants until the last trash entry of its tasks is
   * erased. Set together with `deletedBy`.
   *
   * @type {Date | null}
   * @readonly
   */
  readonly deletedAt: Date | null;

  /**
   * Property deletedBy
   *
   * @description
   * Who deleted the space; `null` for a space that is not deleted. Set together with `deletedAt`.
   *
   * @type {ListActor | null}
   * @readonly
   */
  readonly deletedBy: ListActor | null;

  /**
   * Property restoredAt
   *
   * @description
   * When the space last came back from the trash with a restored task, `null` when it never did:
   * a restored space goes to the end of the sidebar, which orders the spaces by this instant or,
   * without one, by `createdAt` (`positionInSidebarOf`).
   *
   * @type {Date | null}
   * @readonly
   */
  readonly restoredAt: Date | null;

  /**
   * Property version
   *
   * @description
   * Version of the space, a positive integer: 1 at its creation, one more at each change that
   * changes something (a deletion and a restoration from the trash included); also sent as `ETag`.
   *
   * @type {number}
   * @readonly
   */
  readonly version: number;
  // #endregion
}

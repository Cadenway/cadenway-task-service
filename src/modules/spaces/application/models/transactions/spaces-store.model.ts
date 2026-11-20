import type { TrashDeletedTasksQueue } from '../../ports/outbound/jobs/trash/trash-deleted-tasks-queue.port.js';
import type { SpaceLibraryCleanup } from '../../ports/outbound/library/space/space-library-cleanup.port.js';
import type { SpaceEvents } from '../../ports/outbound/messaging/space/space-events.port.js';
import type { GrantRepository } from '../../ports/outbound/persistence/access/grant-repository.port.js';
import type { TaskListRepository } from '../../ports/outbound/persistence/list/task-list-repository.port.js';
import type { SpacePrefixRepository } from '../../ports/outbound/persistence/space/space-prefix-repository.port.js';
import type { SpaceRepository } from '../../ports/outbound/persistence/space/space-repository.port.js';
import type { TransactionClock } from '../../ports/outbound/time/transaction/transaction-clock.port.js';

/**
 * Interface SpacesStore
 *
 * @description
 * The repositories, the events, the clock and the job queue of the spaces module, all bound to the
 * tenant transaction of one unit of work: what they write commits together, or not at all.
 */
export interface SpacesStore {
  // #region Properties
  /** Library cleanup bound to the same transaction as the space or list change. */
  readonly libraryCleanup: SpaceLibraryCleanup;

  /**
   * Property spaces
   *
   * @description
   * The spaces.
   *
   * @type {SpaceRepository}
   * @readonly
   */
  readonly spaces: SpaceRepository;

  /**
   * Property prefixes
   *
   * @description
   * The prefixes and their task counters.
   *
   * @type {SpacePrefixRepository}
   * @readonly
   */
  readonly prefixes: SpacePrefixRepository;

  /**
   * Property lists
   *
   * @description
   * The lists and sprints.
   *
   * @type {TaskListRepository}
   * @readonly
   */
  readonly lists: TaskListRepository;

  /**
   * Property grants
   *
   * @description
   * The grants of the spaces and lists.
   *
   * @type {GrantRepository}
   * @readonly
   */
  readonly grants: GrantRepository;

  /**
   * Property events
   *
   * @description
   * The outbox of the transaction.
   *
   * @type {SpaceEvents}
   * @readonly
   */
  readonly events: SpaceEvents;

  /**
   * Property clock
   *
   * @description
   * The instant of the transaction, which an archive, a deletion and a restoration store.
   *
   * @type {TransactionClock}
   * @readonly
   */
  readonly clock: TransactionClock;

  /**
   * Property trashQueue
   *
   * @description
   * The job of the transaction that moves the tasks of a deleted list or space to the trash.
   *
   * @type {TrashDeletedTasksQueue}
   * @readonly
   */
  readonly trashQueue: TrashDeletedTasksQueue;
  // #endregion
}

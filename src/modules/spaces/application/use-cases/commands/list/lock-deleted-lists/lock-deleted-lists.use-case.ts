import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { LockDeletedListsInput } from './lock-deleted-lists.input.js';
import type { LockDeletedListsOutput } from './lock-deleted-lists.output.js';

/**
 * Constant LOCK_DELETED_LISTS_LIMIT
 *
 * @description
 * How many lists one call takes at most: the erasure of the trash locks the lists of the entries
 * of one batch, and each list costs a space lock at most and its share of two statements.
 *
 * @type {number}
 */
const LOCK_DELETED_LISTS_LIMIT: number = 100;

/**
 * Class LockDeletedLists
 *
 * @description
 * Public operation of the spaces module for the tasks module: `LockDeletedList` for several lists
 * at once, so that the erasure of the trash takes them in the one order of the module. It reads
 * the lists without lock, in one statement; a live or an unknown list answers at once, without
 * any lock. The deleted ones are locked: their spaces `FOR NO KEY UPDATE` one by one in the order
 * `(created_at, id)` of every locker of several spaces (`SpaceRepository.lockInOrder`, as the
 * clean-up of a member who left), then those lists `FOR UPDATE` in one statement in ascending id,
 * the order of every locker of several lists, which reads them again: `live` when a restoration
 * brought one back meanwhile, `not-found` when an erasure removed it. The `FOR UPDATE` conflicts
 * with the `FOR SHARE` of `HoldList`, of a batch of the deletion job and of a creation of a task,
 * so that the caller, which holds the locks until it commits, sees every task of those lists as
 * it stands. No role is checked: the caller checked it. It runs in `SpacesUnitOfWork.run`, which
 * joins the tenant transaction of the caller; it writes nothing.
 */
export class LockDeletedLists {
  // #region Properties
  /**
   * Property unitOfWork
   *
   * @description
   * The tenant transaction of the use case.
   *
   * @type {SpacesUnitOfWork}
   * @readonly
   */
  private readonly unitOfWork: SpacesUnitOfWork;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port.
   *
   * @param {SpacesUnitOfWork} unitOfWork - The tenant transaction.
   * @constructor
   */
  public constructor(unitOfWork: SpacesUnitOfWork) {
    this.unitOfWork = unitOfWork;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Locks the deleted lists among those given, and reads where each stands.
   *
   * @param {LockDeletedListsInput} input - The organization and the lists.
   * @returns {Promise<LockDeletedListsOutput>} Where each list stands.
   * @throws {Error} When more than 100 lists are given, before any statement: a defect of the
   * caller, which cuts its batches.
   */
  public async execute(input: LockDeletedListsInput): Promise<LockDeletedListsOutput> {
    if (input.listIds.length > LOCK_DELETED_LISTS_LIMIT) {
      throw new Error(`LockDeletedLists takes ${String(LOCK_DELETED_LISTS_LIMIT)} lists at most.`);
    }
    const listIds: string[] = [...new Set(input.listIds)];
    if (listIds.length === 0) {
      return { lists: [] };
    }
    return this.unitOfWork.run(async (store: SpacesStore): Promise<LockDeletedListsOutput> => {
      const seen = new Map<string, TaskList>(
        (await store.lists.findManyIncludingDeleted(input.organizationId, listIds)).map(
          (list: TaskList): [string, TaskList] => [list.snapshot.id, list],
        ),
      );
      const deleted: TaskList[] = [...seen.values()].filter(
        (list: TaskList): boolean => list.isDeleted,
      );
      const locked = new Map<string, TaskList>();
      if (deleted.length > 0) {
        await store.spaces.lockInOrder(
          input.organizationId,
          [...new Set(deleted.map((list: TaskList): string => list.snapshot.spaceId))].map(
            (id: string): { readonly id: string; readonly mode: 'update' } => ({
              id,
              mode: 'update',
            }),
          ),
        );
        const underLock: TaskList[] = await store.lists.lockMany(
          input.organizationId,
          deleted.map((list: TaskList): string => list.snapshot.id),
          'delete',
        );
        for (const list of underLock) {
          locked.set(list.snapshot.id, list);
        }
      }
      return {
        lists: listIds.map((listId: string) => ({
          listId,
          outcome: this.outcomeOf(seen.get(listId), locked.get(listId)),
        })),
      };
    });
  }

  /**
   * Method outcomeOf
   *
   * @description
   * Where one list stands, from its row read without lock and, when that row was a tombstone, its
   * row read again under the lock.
   *
   * @param {TaskList | undefined} seen - The row read without lock, if any.
   * @param {TaskList | undefined} locked - The row read under the lock, if any.
   * @returns {'deleted' | 'live' | 'not-found'} Where it stands.
   */
  private outcomeOf(
    seen: TaskList | undefined,
    locked: TaskList | undefined,
  ): 'deleted' | 'live' | 'not-found' {
    if (seen === undefined) {
      return 'not-found';
    }
    if (!seen.isDeleted) {
      return 'live';
    }
    if (locked === undefined) {
      return 'not-found';
    }
    return locked.isDeleted ? 'deleted' : 'live';
  }
  // #endregion
}

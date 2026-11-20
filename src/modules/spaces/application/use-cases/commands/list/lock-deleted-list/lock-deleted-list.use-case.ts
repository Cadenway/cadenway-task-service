import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { LockDeletedListInput } from './lock-deleted-list.input.js';
import type { LockDeletedListOutput } from './lock-deleted-list.output.js';

/**
 * Class LockDeletedList
 *
 * @description
 * Public operation of the spaces module for the tasks module: serializes a restoration or an
 * erasure of a trash entry with the deletion of its list. It reads the list without lock; a live
 * or an unknown list answers at once, without any lock. A deleted one is locked: its space
 * `FOR NO KEY UPDATE`, then the list `FOR UPDATE` (spaces before lists, the lock order of the
 * module), which conflicts with the `FOR SHARE` of `HoldList`, of a batch of the deletion job and
 * of a creation of a task, so that the caller, which holds the lock until it commits, sees every
 * task the job has moved or not as it stands; then the list is read again under the lock: `live`
 * when a restoration brought it back meanwhile, `not-found` when an erasure removed it. No role is
 * checked: the caller checked it. It runs in `SpacesUnitOfWork.run`, which joins the tenant
 * transaction of the caller, after the entry and the tasks it locked; it writes nothing.
 */
export class LockDeletedList {
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
   * Locks the list when it is deleted, and reads where it stands.
   *
   * @param {LockDeletedListInput} input - The organization and the list.
   * @returns {Promise<LockDeletedListOutput>} Where the list stands.
   */
  public async execute(input: LockDeletedListInput): Promise<LockDeletedListOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<LockDeletedListOutput> => {
      const seen: TaskList | null = await store.lists.findIncludingDeleted(
        input.organizationId,
        input.listId,
      );
      if (seen === null) {
        return { outcome: 'not-found' };
      }
      if (!seen.isDeleted) {
        return { outcome: 'live' };
      }
      await store.spaces.lockIncludingDeleted(
        input.organizationId,
        seen.snapshot.spaceId,
        'update',
      );
      const locked: TaskList | null = await store.lists.lockIncludingDeleted(
        input.organizationId,
        input.listId,
        'delete',
      );
      if (locked === null) {
        return { outcome: 'not-found' };
      }
      return { outcome: locked.isDeleted ? 'deleted' : 'live' };
    });
  }
  // #endregion
}

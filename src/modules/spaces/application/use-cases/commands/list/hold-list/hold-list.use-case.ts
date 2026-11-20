import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { ListActor } from '../../../../../domain/value-objects/list/list-actor.value-object.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { HoldListInput } from './hold-list.input.js';
import type { HoldListOutput } from './hold-list.output.js';

/**
 * Class HoldList
 *
 * @description
 * Public operation of the spaces module for the tasks module: holds a list `FOR SHARE` until the
 * end of the transaction of the caller, deleted or not, and tells whether it is deleted, so that a
 * task joining it and the deletion of the list serialize on the row of the list. A deletion of the
 * list, or of its space, writes that row: either it committed first and the caller reads the list
 * `deleted` (and answers as for an unseen list), or it waits for the caller, and its job then moves
 * the new task too. The deletion job holds the list the same way after it locked its tasks, and
 * writes nothing when the list is live again (a restoration brought it back). The space is read
 * without lock: a deleted space has deleted every list of it in the same transaction, so the row
 * of the list decides, and the space only fails closed. No role is checked: the caller checked it.
 * It runs in `SpacesUnitOfWork.run`, which joins the tenant transaction of the caller, after the
 * tasks it locked (tasks before lists, the lock order of the service); it writes nothing.
 */
export class HoldList {
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
   * Holds the list and reads whether it or its space is deleted.
   *
   * @param {HoldListInput} input - The organization and the list.
   * @returns {Promise<HoldListOutput>} Where the list stands.
   */
  public async execute(input: HoldListInput): Promise<HoldListOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<HoldListOutput> => {
      const list: TaskList | null = await store.lists.lockIncludingDeleted(
        input.organizationId,
        input.listId,
        'share',
      );
      if (list === null) {
        return { outcome: 'not-found' };
      }
      if (list.snapshot.deletedBy !== null) {
        return HoldList.deleted(list.snapshot.deletedBy);
      }
      const space: Space | null = await store.spaces.findIncludingDeleted(
        input.organizationId,
        list.snapshot.spaceId,
      );
      if (space === null) {
        return { outcome: 'not-found' };
      }
      return space.snapshot.deletedBy === null
        ? { outcome: 'live' }
        : HoldList.deleted(space.snapshot.deletedBy);
    });
  }

  /**
   * Method deleted
   *
   * @description
   * The outcome of a deleted list, with a copy of who deleted it or its space.
   *
   * @param {ListActor} by - Who deleted the list or its space.
   * @returns {HoldListOutput} The outcome `deleted`.
   */
  private static deleted(by: ListActor): HoldListOutput {
    return { outcome: 'deleted', deletedBy: { type: by.type, id: by.id } };
  }
  // #endregion
}

import type {
  TrashDeletedListTasks,
  TrashDeletedListTasksOutput,
} from '../../../../tasks/public/trash/trash-deleted-list-tasks.js';
import type { DeletedListBatch } from '../../../application/models/deletion/deleted-list-batch.model.js';
import type { RootPosition } from '../../../application/models/deletion/root-position.model.js';
import type { DeletedListTasks } from '../../../application/ports/outbound/tasks/trash/deleted-list-tasks.port.js';

/**
 * Class TasksDeletedListTasks
 *
 * @description
 * `DeletedListTasks` on the public operation `TrashDeletedListTasks` of the tasks module, which
 * joins the tenant transaction of the job batch that calls it, so the dropping of the requests of
 * the tasks it moved commits with it.
 */
export class TasksDeletedListTasks implements DeletedListTasks {
  // #region Properties
  /**
   * Property trashDeletedListTasks
   *
   * @description
   * One batch of the move of the tasks of a deleted list to the trash.
   *
   * @type {TrashDeletedListTasks}
   * @readonly
   */
  private readonly trashDeletedListTasks: TrashDeletedListTasks;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the public operation of the tasks module.
   *
   * @param {TrashDeletedListTasks} trashDeletedListTasks - One batch of the move.
   * @constructor
   */
  public constructor(trashDeletedListTasks: TrashDeletedListTasks) {
    this.trashDeletedListTasks = trashDeletedListTasks;
  }
  // #endregion

  // #region Methods
  /**
   * Method trashBatch
   *
   * @description
   * Runs one batch of `TrashDeletedListTasks` for the list.
   *
   * @param {string} organizationId - The organization of the context.
   * @param {string} listId - The deleted list.
   * @param {RootPosition | null} after - Where the batch starts, `null` for the first.
   * @returns {Promise<DeletedListBatch>} What the batch did.
   */
  public async trashBatch(
    organizationId: string,
    listId: string,
    after: RootPosition | null,
  ): Promise<DeletedListBatch> {
    const output: TrashDeletedListTasksOutput = await this.trashDeletedListTasks.execute({
      organizationId,
      listId,
      after: after === null ? null : { createdAt: after.createdAt, id: after.id },
    });
    switch (output.outcome) {
      case 'list-live':
        return { outcome: 'list-live' };
      case 'none-left':
        return {
          outcome: 'none-left',
          listPurged: output.listPurged,
          spacePurged: output.spacePurged,
        };
      case 'trashed':
        return {
          outcome: 'trashed',
          entries: output.entries,
          taskIds: output.taskIds,
          last: { createdAt: output.last.createdAt, id: output.last.id },
        };
    }
  }
  // #endregion
}

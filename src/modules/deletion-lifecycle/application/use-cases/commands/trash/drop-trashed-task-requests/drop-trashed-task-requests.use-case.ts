import { DeletionStepError } from '../../../../models/deletion/deletion-step-error.model.js';
import type { TargetAccessRequests } from '../../../../ports/outbound/access-requests/access-request/target-access-requests.port.js';
import type { UntrashedTasks } from '../../../../ports/outbound/tasks/trash/untrashed-tasks.port.js';
import type { DeletionUnitOfWork } from '../../../../ports/outbound/transactions/deletion/deletion-unit-of-work.port.js';
import type { DropTrashedTaskRequestsInput } from './drop-trashed-task-requests.input.js';
import type { DropTrashedTaskRequestsOutput } from './drop-trashed-task-requests.output.js';

/**
 * Class DropTrashedTaskRequests
 *
 * @description
 * The work of the `task.drop-trashed-task-requests` job that the tasks module enqueued with
 * "Supprimer la tâche" (`trashTaskInternal`), once per entry: the pending access requests of the
 * tasks of the entry that are still in the trash, or already erased, are dropped ("The pending
 * requests of a target that is deleted ... are dropped" of `openapi/public/access.yaml`), without
 * event. In one tenant transaction of the organization of the job, which `DeletionUnitOfWork`
 * owns: `ListUntrashedTaskIds` of tasks reads which of them are out of the trash again (a
 * restoration that came first), and `DropTargetAccessRequests` of access-requests drops the
 * requests of the others, so a task restored before the job ran keeps its requests. The read locks
 * the tasks `FOR SHARE` until the commit, so a restoration running meanwhile waits for the drop, or
 * the drop waits for it and reads the task out of the trash. They were
 * hidden from the commit of the trash on, since a task in the trash is no longer found. A run once
 * they are gone deletes nothing, which makes the job idempotent.
 */
export class DropTrashedTaskRequests {
  // #region Properties
  /** The tenant transaction of the job. */
  private readonly unitOfWork: DeletionUnitOfWork;

  /** Which tasks are out of the trash. */
  private readonly tasks: UntrashedTasks;

  /** The pending access requests of the tasks. */
  private readonly requests: TargetAccessRequests;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the unit of work, the tasks and the requests.
   *
   * @param {DeletionUnitOfWork} unitOfWork - The tenant transaction of the job.
   * @param {UntrashedTasks} tasks - Which tasks are out of the trash.
   * @param {TargetAccessRequests} requests - The pending access requests.
   * @constructor
   */
  public constructor(
    unitOfWork: DeletionUnitOfWork,
    tasks: UntrashedTasks,
    requests: TargetAccessRequests,
  ) {
    this.unitOfWork = unitOfWork;
    this.tasks = tasks;
    this.requests = requests;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Drops the pending requests of the tasks of the entry that are not out of the trash.
   *
   * @param {DropTrashedTaskRequestsInput} input - The organization and the tasks of the entry.
   * @returns {Promise<DropTrashedTaskRequestsOutput>} How many requests were dropped, and how many
   * tasks were found out of the trash.
   * @throws {DeletionStepError} Of the step `requests`, when the transaction fails (a lock or
   * statement timeout included): it rolls back and the job is retried.
   */
  public async execute(
    input: DropTrashedTaskRequestsInput,
  ): Promise<DropTrashedTaskRequestsOutput> {
    try {
      return await this.unitOfWork.run(async (): Promise<DropTrashedTaskRequestsOutput> => {
        // Locks the tasks FOR SHARE until the commit: a restoration waits for the drop, or the
        // drop reads the tasks it restored and keeps their requests.
        const untrashed: ReadonlySet<string> = new Set<string>(
          await this.tasks.untrashedOf(input.organizationId, input.taskIds),
        );
        const taskIds: readonly string[] = input.taskIds.filter(
          (taskId: string): boolean => !untrashed.has(taskId),
        );
        const dropped: number =
          taskIds.length > 0
            ? await this.requests.dropPending(input.organizationId, { kind: 'tasks', taskIds })
            : 0;
        return { dropped, untrashed: input.taskIds.length - taskIds.length };
      });
    } catch (error: unknown) {
      throw new DeletionStepError('requests', 0, error);
    }
  }
  // #endregion
}

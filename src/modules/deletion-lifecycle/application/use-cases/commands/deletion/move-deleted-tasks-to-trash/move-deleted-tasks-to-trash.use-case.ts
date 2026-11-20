import type { DeletedListBatch } from '../../../../models/deletion/deleted-list-batch.model.js';
import type { DeletedSpaceListing } from '../../../../models/deletion/deleted-space-listing.model.js';
import type { DeletedSpacePurge } from '../../../../models/deletion/deleted-space-purge.model.js';
import { DeletionStepError } from '../../../../models/deletion/deletion-step-error.model.js';
import type { DeletionStep } from '../../../../models/deletion/deletion-step.model.js';
import type { RootPosition } from '../../../../models/deletion/root-position.model.js';
import type { TargetAccessRequests } from '../../../../ports/outbound/access-requests/access-request/target-access-requests.port.js';
import type { DeletedSpaceLists } from '../../../../ports/outbound/spaces/list/deleted-space-lists.port.js';
import type { DeletedSpaceEraser } from '../../../../ports/outbound/spaces/space/deleted-space-eraser.port.js';
import type { DeletedListTasks } from '../../../../ports/outbound/tasks/trash/deleted-list-tasks.port.js';
import type { DeletionUnitOfWork } from '../../../../ports/outbound/transactions/deletion/deletion-unit-of-work.port.js';
import type { MoveDeletedTasksToTrashInput } from './move-deleted-tasks-to-trash.input.js';
import type { MoveDeletedTasksToTrashOutput } from './move-deleted-tasks-to-trash.output.js';

/**
 * Constant MAX_RESCANS
 *
 * @description
 * How many times one attempt starts a list again from its first root when a batch answers
 * `rescan` (tasks of the list still out of the trash although no candidate root was left after the
 * position: a task moved behind the cursor). One more is a defect, which fails the attempt.
 *
 * @type {number}
 */
const MAX_RESCANS: number = 3;

/** The counts of a run, as they grow batch after batch. */
interface Progress {
  // #region Properties
  /** The trash entries made. */
  entries: number;

  /** The tasks moved to the trash. */
  tasks: number;

  /** The pending access requests dropped. */
  requestsDropped: number;

  /** The tombstones of lists erased. */
  listsPurged: number;

  /** Whether the deleted space was erased. */
  spacePurged: boolean;

  /** The lists found live again. */
  listsLive: number;

  /** The batches committed that moved tasks. */
  batches: number;
  // #endregion
}

/** What one batch of a list did, with the pending requests it dropped. */
type ListBatchResult = DeletedListBatch & { readonly dropped: number };

/** What the reading of the lists of a space did, with the pending requests it dropped. */
type SpaceListingResult = DeletedSpaceListing & { readonly dropped: number };

/**
 * Class MoveDeletedTasksToTrash
 *
 * @description
 * The work of the `task.trash-deleted-tasks` job that the spaces module enqueued with the deletion
 * of a list or a space (`deleteListInternal`, `deleteSpaceInternal` of
 * `openapi/internal/task-service.yaml`: "the deletion job moves its tasks to the trash"; "Deleting
 * a list or a space makes one entry per top-level task, within minutes of the deletion" of
 * `openapi/public/trash.yaml`). It runs in the organization context of the job, after the deletion
 * committed. `DeletionUnitOfWork` owns the tenant transaction of each step, which the public
 * operations of the other modules join:
 *
 * 1. for a space, one transaction: `ListDeletedSpaceLists` of spaces holds the space `FOR SHARE`
 *    and reads whether it is still deleted, live again or gone (erased) and its deleted lists not
 *    erased yet, by id; unless it is live again, the pending requests of the space and of its lists
 *    are dropped in the same transaction (`DropTargetAccessRequests` of access-requests, kind
 *    `space`): a deleted space has all its lists deleted and an erased one has none left, so each
 *    of those list requests belongs to a deleted or erased list, those erased before the job ran
 *    included; for a list, the list itself;
 * 2. for each list, batch after batch, from the first root of the list, then after the last root of
 *    the previous batch, one transaction: `TrashDeletedListTasks` of tasks (one entry per task that
 *    reads as top-level, with its subtasks, with the actor of the deletion and one
 *    `task.trashed.v1` per task), which holds the list `FOR SHARE` and writes nothing once it is no
 *    longer deleted (`list-live`); in the first batch that saw it deleted or gone (`trashed`,
 *    `none-left` or `list-gone`), the pending requests of the list, and in every `trashed` batch
 *    those of the tasks it moved, both dropped in the same transaction, so a failed drop rolls the
 *    batch back; `list-live`, `list-gone` (erased before the job reached it) and `none-left` (the
 *    tombstone of the list, and of its space, erased when no task references it) end the list;
 *    `rescan` (tasks of the list still out of the trash behind the position) starts the list again
 *    from its first root, 3 times at most per list and attempt, then fails the attempt as a
 *    defect;
 * 3. for a space, once its lists are handled, the erasure of the space when no list row of it is
 *    left (`PurgeDeletedSpace` of spaces), unless a list already erased it.
 *
 * The requests of a target are dropped only in a transaction that read the target deleted under
 * its lock, so a restoration that brought it back first keeps them. It stops a list only on
 * `none-left` or `list-live`, never on a short batch, and starts no step once the signal of its
 * attempt aborted. A failed step rolls back alone: the batches before it stay committed, the
 * attempt fails with a `DeletionStepError` naming the step and the batches committed before it,
 * and the next attempt starts again from what is still to move: a root moved to the trash is no
 * longer a candidate, a request dropped is gone, so nothing is written twice. A run that finds
 * nothing left changes nothing, which makes the job idempotent.
 */
export class MoveDeletedTasksToTrash {
  // #region Properties
  /** The tenant transaction of each step. */
  private readonly unitOfWork: DeletionUnitOfWork;

  /** The pending access requests of the space, the lists and the tasks moved. */
  private readonly requests: TargetAccessRequests;

  /** The deleted lists of a deleted space. */
  private readonly lists: DeletedSpaceLists;

  /** The move of the tasks of a deleted list to the trash, one batch per call. */
  private readonly tasks: DeletedListTasks;

  /** The erasure of a deleted space left without a list. */
  private readonly spaces: DeletedSpaceEraser;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the unit of work and the four outbound ports.
   *
   * @param {DeletionUnitOfWork} unitOfWork - The tenant transaction of each step.
   * @param {TargetAccessRequests} requests - The pending access requests.
   * @param {DeletedSpaceLists} lists - The deleted lists of a space.
   * @param {DeletedListTasks} tasks - The move of the tasks of a list.
   * @param {DeletedSpaceEraser} spaces - The erasure of a deleted space.
   * @constructor
   */
  public constructor(
    unitOfWork: DeletionUnitOfWork,
    requests: TargetAccessRequests,
    lists: DeletedSpaceLists,
    tasks: DeletedListTasks,
    spaces: DeletedSpaceEraser,
  ) {
    this.unitOfWork = unitOfWork;
    this.requests = requests;
    this.lists = lists;
    this.tasks = tasks;
    this.spaces = spaces;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Moves the tasks of each deleted list of the target to the trash, one committed batch after
   * another, with the pending requests of what it finds deleted, then erases a deleted space left
   * without a list.
   *
   * @param {MoveDeletedTasksToTrashInput} input - The organization, the deleted list or space and
   * the signal of the attempt.
   * @returns {Promise<MoveDeletedTasksToTrashOutput>} How the run ended, with its counts.
   * @throws {DeletionStepError} When a step fails (the database, a lock or statement timeout): that
   * step rolls back, the earlier ones stay, and the job is retried; the error names the step and the
   * batches committed before it, with the failure as its cause.
   * @throws {Error} The reason of the signal once it aborted, as it is.
   */
  public async execute(
    input: MoveDeletedTasksToTrashInput,
  ): Promise<MoveDeletedTasksToTrashOutput> {
    const { organizationId, target } = input;
    const progress: Progress = {
      entries: 0,
      tasks: 0,
      requestsDropped: 0,
      listsPurged: 0,
      spacePurged: false,
      listsLive: 0,
      batches: 0,
    };
    input.signal?.throwIfAborted();
    const listIds: readonly string[] =
      target.kind === 'list'
        ? [target.listId]
        : await this.listsOfSpace(organizationId, target.spaceId, progress);
    for (const listId of listIds) {
      await this.moveList(organizationId, listId, progress, input.signal);
    }
    if (target.kind === 'space' && !progress.spacePurged) {
      input.signal?.throwIfAborted();
      const erased: DeletedSpacePurge = await this.step('space', progress, () =>
        this.unitOfWork.run((): Promise<DeletedSpacePurge> =>
          this.spaces.erase(organizationId, target.spaceId),
        ),
      );
      progress.spacePurged = erased === 'purged';
    }
    return {
      outcome: progress.listsLive > 0 ? 'list-live' : 'completed',
      entries: progress.entries,
      tasks: progress.tasks,
      requestsDropped: progress.requestsDropped,
      listsPurged: progress.listsPurged,
      spacePurged: progress.spacePurged,
      batches: progress.batches,
    };
  }

  /**
   * Method listsOfSpace
   *
   * @description
   * Reads the deleted lists of a space, the space held `FOR SHARE`, and drops the pending requests of
   * the space itself in the same transaction when it is still deleted.
   *
   * @param {string} organizationId - The organization of the job.
   * @param {string} spaceId - The deleted space.
   * @param {Progress} progress - The counts of the run so far.
   * @returns {Promise<readonly string[]>} Its deleted lists, by id.
   * @throws {DeletionStepError} When the step fails.
   */
  private async listsOfSpace(
    organizationId: string,
    spaceId: string,
    progress: Progress,
  ): Promise<readonly string[]> {
    const listing: SpaceListingResult = await this.step('lists', progress, () =>
      this.unitOfWork.run(async (): Promise<SpaceListingResult> => {
        const read: DeletedSpaceListing = await this.lists.deletedListsOf(organizationId, spaceId);
        const dropped: number =
          read.space === 'live'
            ? 0
            : await this.requests.dropPending(organizationId, { kind: 'space', spaceId });
        return { ...read, dropped };
      }),
    );
    progress.requestsDropped += listing.dropped;
    return listing.listIds;
  }

  /**
   * Method moveList
   *
   * @description
   * Moves the tasks of one deleted list to the trash, batch after batch, each with the dropping of
   * the requests of the tasks it moved, and the first one that saw the list deleted with the
   * requests of the list, in its transaction, until the list holds nothing left to move or is live
   * again.
   *
   * @param {string} organizationId - The organization of the job.
   * @param {string} listId - The deleted list.
   * @param {Progress} progress - The counts of the run so far.
   * @param {AbortSignal | undefined} signal - The signal of the attempt.
   * @returns {Promise<void>} Resolves once the list is handled.
   * @throws {DeletionStepError} When a batch fails.
   */
  private async moveList(
    organizationId: string,
    listId: string,
    progress: Progress,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    let after: RootPosition | null = null;
    let listRequestsDropped: boolean = false;
    let rescans: number = 0;
    for (;;) {
      signal?.throwIfAborted();
      const from: RootPosition | null = after;
      const withListRequests: boolean = !listRequestsDropped;
      const batch: ListBatchResult = await this.step('tasks', progress, () =>
        this.unitOfWork.run(async (): Promise<ListBatchResult> => {
          const moved: DeletedListBatch = await this.tasks.trashBatch(organizationId, listId, from);
          if (moved.outcome === 'list-live' || moved.outcome === 'rescan') {
            return { ...moved, dropped: 0 };
          }
          let dropped: number = withListRequests
            ? await this.requests.dropPending(organizationId, { kind: 'list', listId })
            : 0;
          if (moved.outcome === 'trashed' && moved.taskIds.length > 0) {
            dropped += await this.requests.dropPending(organizationId, {
              kind: 'tasks',
              taskIds: moved.taskIds,
            });
          }
          return { ...moved, dropped };
        }),
      );
      progress.requestsDropped += batch.dropped;
      if (batch.outcome === 'list-live') {
        progress.listsLive += 1;
        return;
      }
      if (batch.outcome === 'rescan') {
        rescans += 1;
        if (rescans > MAX_RESCANS) {
          throw new DeletionStepError(
            'tasks',
            progress.batches,
            new Error(
              `The deleted list still holds tasks out of the trash after ${String(MAX_RESCANS)} rescans.`,
            ),
          );
        }
        after = null;
        continue;
      }
      listRequestsDropped = true;
      if (batch.outcome === 'list-gone') {
        return;
      }
      if (batch.outcome === 'none-left') {
        progress.listsPurged += batch.listPurged ? 1 : 0;
        progress.spacePurged = progress.spacePurged || batch.spacePurged;
        return;
      }
      progress.batches += 1;
      progress.entries += batch.entries;
      progress.tasks += batch.taskIds.length;
      after = batch.last;
    }
  }

  /**
   * Method step
   *
   * @description
   * Runs one step, and turns its failure into a `DeletionStepError` that names the step and the
   * batches committed before it, the original error as its cause.
   *
   * @param {DeletionStep} step - The step.
   * @param {Progress} progress - The counts of the run so far.
   * @param {() => Promise<TResult>} run - The transaction of the step.
   * @returns {Promise<TResult>} What the step resolved with.
   * @throws {DeletionStepError} When the step fails.
   */
  private async step<TResult>(
    step: DeletionStep,
    progress: Progress,
    run: () => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await run();
    } catch (error: unknown) {
      throw new DeletionStepError(step, progress.batches, error);
    }
  }
  // #endregion
}

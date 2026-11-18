import type { SpaceHandoverBatch } from '../../../../models/clean-up/space-handover-batch.model.js';
import type { TaskUnassignmentBatch } from '../../../../models/clean-up/task-unassignment-batch.model.js';
import type { PrivateSpaceHandover } from '../../../../ports/outbound/spaces/space/private-space-handover.port.js';
import type { TaskAssignments } from '../../../../ports/outbound/tasks/assignee/task-assignments.port.js';
import type { CleanUpRemovedMemberInput } from './clean-up-removed-member.input.js';
import type { CleanUpRemovedMemberOutput } from './clean-up-removed-member.output.js';

/** The counts of a run, as they grow batch after batch. */
interface Progress {
  // #region Properties
  /** The spaces given to the owner of the organization. */
  spacesHandedOver: number;

  /** The spaces left awaiting an owner. */
  spacesAwaitingOwner: number;

  /** The tasks the account was removed from. */
  tasksUnassigned: number;

  /** The batches committed. */
  batches: number;
  // #endregion
}

/**
 * Class CleanUpRemovedMember
 *
 * @description
 * The work of the clean-up job that `ApplyMemberEvent` enqueued with a removal
 * (`member.removed.v1`; "Members" of `openapi/internal/task-service.yaml`). It runs in the
 * organization context of the job, outside the transaction of the removal, and orchestrates two
 * modules, each batch in its own tenant transaction that the module opens:
 *
 * 1. the private spaces of the former member, in batches of 100 (`HandOverPrivateSpaces` of
 *    spaces), until a batch finds none left: each passes to the owner of the organization
 *    (`space.updated.v1`, system actor), or awaits one while the copy does not hold that owner;
 * 2. then their assignments, in batches of 500 after the last task id of the previous batch
 *    (`UnassignRemovedMember` of tasks), until a batch finds none left.
 *
 * A batch that reads the copy holding the account as a member again (a new membership joined after
 * the removal) changes nothing, and the job stops for good: the person keeps what is left. It
 * stops only on an empty batch or on that answer, never on a short batch, and starts no batch once
 * the signal of its attempt aborted. A failed batch rolls back alone: the batches before it stay
 * committed, the attempt fails, and the next attempt starts again from the spaces and tasks still
 * owned or assigned, so nothing is written twice. A run that finds nothing left changes nothing,
 * which makes the job idempotent.
 */
export class CleanUpRemovedMember {
  // #region Properties
  /** The handover of the private spaces, one batch per call. */
  private readonly spaces: PrivateSpaceHandover;

  /** The unassignment from the tasks, one batch per call. */
  private readonly assignments: TaskAssignments;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the two outbound ports.
   *
   * @param {PrivateSpaceHandover} spaces - The handover of the private spaces.
   * @param {TaskAssignments} assignments - The unassignment from the tasks.
   * @constructor
   */
  public constructor(spaces: PrivateSpaceHandover, assignments: TaskAssignments) {
    this.spaces = spaces;
    this.assignments = assignments;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Hands the private spaces of the former member over, then removes them from their tasks, one
   * committed batch after another.
   *
   * @param {CleanUpRemovedMemberInput} input - The organization, the former member and the signal
   * of the attempt.
   * @returns {Promise<CleanUpRemovedMemberOutput>} How the run ended, with its counts; a space or a
   * task a batch found already as wanted is not counted.
   * @throws {Error} When a batch fails (the database, a lock or statement timeout): that batch
   * rolls back, the earlier ones stay, and the job is retried. Also the reason of the signal once it
   * aborted.
   */
  public async execute(input: CleanUpRemovedMemberInput): Promise<CleanUpRemovedMemberOutput> {
    const progress: Progress = {
      spacesHandedOver: 0,
      spacesAwaitingOwner: 0,
      tasksUnassigned: 0,
      batches: 0,
    };
    for (;;) {
      input.signal?.throwIfAborted();
      const batch: SpaceHandoverBatch = await this.spaces.handOverBatch(
        input.organizationId,
        input.userId,
      );
      if (batch.outcome === 'member-again') {
        return { outcome: 'member-again', ...progress };
      }
      if (batch.outcome === 'none-left') {
        break;
      }
      progress.batches += 1;
      progress.spacesHandedOver += batch.handedOver;
      progress.spacesAwaitingOwner += batch.awaitingOwner;
    }
    let afterTaskId: string | null = null;
    for (;;) {
      input.signal?.throwIfAborted();
      const batch: TaskUnassignmentBatch = await this.assignments.unassignBatch(
        input.organizationId,
        input.userId,
        afterTaskId,
      );
      if (batch.outcome === 'member-again') {
        return { outcome: 'member-again', ...progress };
      }
      if (batch.outcome === 'none-left') {
        return { outcome: 'completed', ...progress };
      }
      progress.batches += 1;
      progress.tasksUnassigned += batch.unassigned;
      afterTaskId = batch.lastTaskId;
    }
  }
  // #endregion
}

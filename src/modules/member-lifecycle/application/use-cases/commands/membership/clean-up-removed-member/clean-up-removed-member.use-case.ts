import type { GrantRemovalBatch } from '../../../../models/clean-up/grant-removal-batch.model.js';
import type { RequestDropBatch } from '../../../../models/clean-up/request-drop-batch.model.js';
import type { SpaceHandoverBatch } from '../../../../models/clean-up/space-handover-batch.model.js';
import type { TaskUnassignmentBatch } from '../../../../models/clean-up/task-unassignment-batch.model.js';
import type { MemberAccessRequests } from '../../../../ports/outbound/access-requests/access-request/member-access-requests.port.js';
import type { MemberGrants } from '../../../../ports/outbound/spaces/access/member-grants.port.js';
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

  /** The grants of spaces and lists removed. */
  grantsRemoved: number;

  /** The pending access requests dropped. */
  requestsDropped: number;

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
 * organization context of the job, outside the transaction of the removal, and orchestrates three
 * modules, each batch in its own tenant transaction that the module opens:
 *
 * 1. the private spaces of the former member, in batches of 100 (`HandOverPrivateSpaces` of
 *    spaces), until a batch finds none left: each passes to the owner of the organization
 *    (`space.updated.v1`, system actor), or awaits one while the copy does not hold that owner;
 * 2. then their grants of spaces and lists, in batches of 100 (`RemoveMemberGrants` of spaces),
 *    until a batch finds none left (`space.access-changed.v1` or `list.access-changed.v1`, system
 *    actor; "A person who leaves the organization loses their grants" of
 *    `openapi/public/access.yaml`);
 * 3. then their pending access requests and attempts, in batches of 500
 *    (`DropMemberAccessRequests` of access-requests), until a batch finds none left, without event;
 * 4. then their assignments, in batches of 500 after the last task id of the previous batch
 *    (`UnassignRemovedMember` of tasks), until a batch finds none left.
 *
 * The spaces come first, since a private space of a former member is seen by nobody until it is
 * handed over; the grants before the requests, since a grant still gives access while a pending
 * request gives none. A batch that reads the copy holding the account as a member again (a new
 * membership joined after the removal) changes nothing, and the job stops for good: the person
 * keeps what is left. It stops only on an empty batch or on that answer, never on a short batch,
 * and starts no batch once the signal of its attempt aborted. A failed batch rolls back alone: the
 * batches before it stay committed, the attempt fails, and the next attempt starts again from what
 * is still owned, granted, pending or assigned, so nothing is written twice. A run that finds
 * nothing left changes nothing, which makes the job idempotent.
 */
export class CleanUpRemovedMember {
  // #region Properties
  /** The handover of the private spaces, one batch per call. */
  private readonly spaces: PrivateSpaceHandover;

  /** The removal of the grants, one batch per call. */
  private readonly grants: MemberGrants;

  /** The dropping of the pending access requests, one batch per call. */
  private readonly requests: MemberAccessRequests;

  /** The unassignment from the tasks, one batch per call. */
  private readonly assignments: TaskAssignments;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the four outbound ports.
   *
   * @param {PrivateSpaceHandover} spaces - The handover of the private spaces.
   * @param {MemberGrants} grants - The removal of the grants.
   * @param {MemberAccessRequests} requests - The dropping of the pending access requests.
   * @param {TaskAssignments} assignments - The unassignment from the tasks.
   * @constructor
   */
  public constructor(
    spaces: PrivateSpaceHandover,
    grants: MemberGrants,
    requests: MemberAccessRequests,
    assignments: TaskAssignments,
  ) {
    this.spaces = spaces;
    this.grants = grants;
    this.requests = requests;
    this.assignments = assignments;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Hands the private spaces of the former member over, removes their grants, drops their pending
   * access requests, then removes them from their tasks, one committed batch after another.
   *
   * @param {CleanUpRemovedMemberInput} input - The organization, the former member and the signal
   * of the attempt.
   * @returns {Promise<CleanUpRemovedMemberOutput>} How the run ended, with its counts; a space, a
   * grant, a request or a task a batch found already as wanted is not counted.
   * @throws {Error} When a batch fails (the database, a lock or statement timeout): that batch
   * rolls back, the earlier ones stay, and the job is retried. Also the reason of the signal once it
   * aborted.
   */
  public async execute(input: CleanUpRemovedMemberInput): Promise<CleanUpRemovedMemberOutput> {
    const progress: Progress = {
      spacesHandedOver: 0,
      spacesAwaitingOwner: 0,
      grantsRemoved: 0,
      requestsDropped: 0,
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
    for (;;) {
      input.signal?.throwIfAborted();
      const batch: GrantRemovalBatch = await this.grants.removeBatch(
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
      progress.grantsRemoved += batch.removed;
    }
    for (;;) {
      input.signal?.throwIfAborted();
      const batch: RequestDropBatch = await this.requests.dropBatch(
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
      progress.requestsDropped += batch.dropped;
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

import { CleanUpStepError } from '../../../../models/clean-up/clean-up-step-error.model.js';
import type { CleanUpStep } from '../../../../models/clean-up/clean-up-step.model.js';
import type { GrantRemovalBatch } from '../../../../models/clean-up/grant-removal-batch.model.js';
import type { RequestDropBatch } from '../../../../models/clean-up/request-drop-batch.model.js';
import type { SpaceHandoverBatch } from '../../../../models/clean-up/space-handover-batch.model.js';
import type { TaskUnassignmentBatch } from '../../../../models/clean-up/task-unassignment-batch.model.js';
import type { WatcherOverrideRemovalBatch } from '../../../../models/clean-up/watcher-override-removal-batch.model.js';
import type { MemberAccessRequests } from '../../../../ports/outbound/access-requests/access-request/member-access-requests.port.js';
import type { MemberFavorites } from '../../../../ports/outbound/favorites/member/member-favorites.port.js';
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

  /** The access requests dropped, pending or answered. */
  requestsDropped: number;

  /** The tasks the account was removed from. */
  tasksUnassigned: number;

  /** The explicit task watcher overrides removed. */
  watcherOverridesRemoved: number;

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
 * organization context of the job, outside the transaction of the removal, and orchestrates
 * modules, each batch in its own tenant transaction that the module opens:
 *
 * 1. the private spaces of the former member, in batches of 100 (`HandOverPrivateSpaces` of
 *    spaces), until a batch finds none left: each passes to the owner of the organization
 *    (`space.updated.v1`, system actor), or awaits one while the copy does not hold that owner;
 * 2. then their private favorites, after a locked membership recheck (`PurgeMemberFavorites`);
 * 3. then their grants of spaces and lists, in batches of 100 (`RemoveMemberGrants` of spaces),
 *    until a batch finds none left (`space.access-changed.v1` or `list.access-changed.v1`, system
 *    actor; "A person who leaves the organization loses their grants" of
 *    `openapi/public/access.yaml`);
 * 4. then their access requests, pending or answered, and their attempts, in batches of 500
 *    (`DropMemberAccessRequests` of access-requests), until a batch finds none left, without event;
 * 5. then their assignments, in batches of 500 after the last task id of the previous batch
 *    (`UnassignRemovedMember` of tasks), until a batch finds none left;
 * 6. then their watcher overrides in batches of 500 after the last task id of the previous
 *    batch (`RemoveMemberWatcherOverrides` of tasks), without changing the task or emitting an event.
 *
 * The spaces come first, since a private space of a former member is seen by nobody until it is
 * handed over; the grants before the requests, since a grant still gives access while a pending
 * request gives none. A batch that reads the copy holding the account as a member again (a new
 * membership joined after the removal) changes nothing, and the job stops for good: the person
 * keeps what is left. It stops only on an empty batch or on that answer, never on a short batch,
 * and starts no batch once the signal of its attempt aborted. A failed batch rolls back alone: the
 * batches before it stay committed, the attempt fails with a `CleanUpStepError` naming the step
 * and the batches committed before it, and the next attempt starts again from what is still owned,
 * granted, asked for, assigned or overridden, so nothing is written twice. A run that finds
 * nothing left changes nothing, which makes the job idempotent.
 */
export class CleanUpRemovedMember {
  // #region Properties
  /** The handover of the private spaces, one batch per call. */
  private readonly spaces: PrivateSpaceHandover;

  /** The removal of a departed member's private favorites. */
  private readonly favorites: MemberFavorites;

  /** The removal of the grants, one batch per call. */
  private readonly grants: MemberGrants;

  /** The dropping of the access requests, one batch per call. */
  private readonly requests: MemberAccessRequests;

  /** The task unassignment and watcher cleanup, one batch per call. */
  private readonly assignments: TaskAssignments;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the five outbound ports.
   *
   * @param {PrivateSpaceHandover} spaces - The handover of the private spaces.
   * @param {MemberGrants} grants - The removal of the grants.
   * @param {MemberAccessRequests} requests - The dropping of the access requests.
   * @param {TaskAssignments} assignments - The task unassignment and watcher cleanup.
   * @param {MemberFavorites} favorites - The removal of personal favorites.
   * @constructor
   */
  public constructor(
    spaces: PrivateSpaceHandover,
    grants: MemberGrants,
    requests: MemberAccessRequests,
    assignments: TaskAssignments,
    favorites: MemberFavorites,
  ) {
    this.spaces = spaces;
    this.grants = grants;
    this.requests = requests;
    this.assignments = assignments;
    this.favorites = favorites;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Hands the private spaces of the former member over, removes their grants, drops their pending
   * access requests, then removes their task assignments and watcher overrides, one committed
   * batch after another.
   *
   * @param {CleanUpRemovedMemberInput} input - The organization, the former member and the signal
   * of the attempt.
   * @returns {Promise<CleanUpRemovedMemberOutput>} How the run ended, with its counts; a space, a
   * grant, a request, an assignment or an override a batch found already as wanted is not counted.
   * @throws {CleanUpStepError} When a batch fails (the database, a lock or statement timeout):
   * that batch rolls back, the earlier ones stay, and the job is retried; the error names the step
   * and the batches committed before it, with the failure as its cause.
   * @throws {Error} The reason of the signal once it aborted, as it is.
   */
  public async execute(input: CleanUpRemovedMemberInput): Promise<CleanUpRemovedMemberOutput> {
    const progress: Progress = {
      spacesHandedOver: 0,
      spacesAwaitingOwner: 0,
      grantsRemoved: 0,
      requestsDropped: 0,
      tasksUnassigned: 0,
      watcherOverridesRemoved: 0,
      batches: 0,
    };
    for (;;) {
      input.signal?.throwIfAborted();
      const batch: SpaceHandoverBatch = await this.batch('spaces', progress, () =>
        this.spaces.handOverBatch(input.organizationId, input.userId),
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
    input.signal?.throwIfAborted();
    await this.batch('favorites', progress, () =>
      this.favorites.purge(input.organizationId, input.userId),
    );
    for (;;) {
      input.signal?.throwIfAborted();
      const batch: GrantRemovalBatch = await this.batch('grants', progress, () =>
        this.grants.removeBatch(input.organizationId, input.userId),
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
      const batch: RequestDropBatch = await this.batch('requests', progress, () =>
        this.requests.dropBatch(input.organizationId, input.userId),
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
      const after: string | null = afterTaskId;
      const batch: TaskUnassignmentBatch = await this.batch('tasks', progress, () =>
        this.assignments.unassignBatch(input.organizationId, input.userId, after),
      );
      if (batch.outcome === 'member-again') {
        return { outcome: 'member-again', ...progress };
      }
      if (batch.outcome === 'none-left') {
        break;
      }
      progress.batches += 1;
      progress.tasksUnassigned += batch.unassigned;
      afterTaskId = batch.lastTaskId;
    }
    afterTaskId = null;
    for (;;) {
      input.signal?.throwIfAborted();
      const after: string | null = afterTaskId;
      const batch: WatcherOverrideRemovalBatch = await this.batch('watchers', progress, () =>
        this.assignments.clearWatcherOverridesBatch(input.organizationId, input.userId, after),
      );
      if (batch.outcome === 'member-again') {
        return { outcome: 'member-again', ...progress };
      }
      if (batch.outcome === 'none-left') {
        return { outcome: 'completed', ...progress };
      }
      progress.batches += 1;
      progress.watcherOverridesRemoved += batch.removed;
      afterTaskId = batch.lastTaskId;
    }
  }

  /**
   * Method batch
   *
   * @description
   * Runs one batch of a step, and turns its failure into a `CleanUpStepError` that names the step
   * and the batches committed before it, the original error as its cause.
   *
   * @param {CleanUpStep} step - The step of the batch.
   * @param {Progress} progress - The counts of the run so far.
   * @param {() => Promise<TBatch>} run - The call of the port.
   * @returns {Promise<TBatch>} What the batch did.
   * @throws {CleanUpStepError} When the batch fails.
   */
  private async batch<TBatch>(
    step: CleanUpStep,
    progress: Progress,
    run: () => Promise<TBatch>,
  ): Promise<TBatch> {
    try {
      return await run();
    } catch (error: unknown) {
      throw new CleanUpStepError(step, progress.batches, error);
    }
  }
  // #endregion
}

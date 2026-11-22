import { DomainError } from '../../../../../domain/errors/task/domain.error.js';
import { InvalidTaskError } from '../../../../../domain/errors/task/invalid-task.error.js';
import { canApplyGitStatus } from '../../../../../domain/policies/task/git-status-progression.policy.js';
import type { AssigneeCandidate } from '../../../../../domain/value-objects/member/assignee-candidate.value-object.js';
import type { MemberRole } from '../../../../../domain/value-objects/member/member-role.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { TaskActor } from '../../../../../domain/value-objects/task/task-actor.value-object.js';
import type { TaskUpdate } from '../../../../../domain/value-objects/task/task-update.value-object.js';
import type { DelegatedMembershipProof } from '../../../../models/membership/delegated-membership-proof.model.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import { WatcherAudienceChanged } from '../../../../models/watcher/watcher-audience-changed.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { DelegatedMemberships } from '../../../queries/member/delegated-memberships/delegated-memberships.use-case.js';
import { TaskChangeWriter } from '../../../../services/task/task-change-writer.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import { TaskOccurrenceScheduler } from '../../../../services/task/task-occurrence-scheduler.service.js';
import { EffectiveWatchers } from '../../../../services/watcher/effective-watchers.service.js';
import { withWatcherAudienceRetry } from '../../../../services/watcher/watcher-audience-retry.service.js';
import type { ApplyGitTaskStatusInput } from './apply-git-task-status.input.js';
import type { ApplyGitTaskStatusOutput } from './apply-git-task-status.output.js';

/** Applies an authenticated Git status rule using the mapping author's current task authority. */
export class ApplyGitTaskStatus {
  // #region Properties
  /** Checks and holds the live task placement. */
  private readonly locator: TaskLocator;

  /** Plans a successor for a recurring task. */
  private readonly recurrence: TaskOccurrenceScheduler;

  /** Checks who is eligible for resulting activity and notifications. */
  private readonly watchers: EffectiveWatchers;

  /** Appends the ordinary effects in the same task transaction. */
  private readonly writer = new TaskChangeWriter();
  // #endregion

  // #region Constructor
  /** Binds the tenant transaction and current membership and placement authorities. */
  public constructor(
    private readonly work: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
    private readonly memberships: DelegatedMemberships,
  ) {
    this.locator = new TaskLocator(spaces);
    this.recurrence = new TaskOccurrenceScheduler(spaces);
    this.watchers = new EffectiveWatchers(members, spaces);
  }
  // #endregion

  // #region Methods
  /** Locks and rechecks authority before returning a placement or mutating a task. */
  public async execute(
    input: ApplyGitTaskStatusInput,
    proof?: DelegatedMembershipProof,
  ): Promise<ApplyGitTaskStatusOutput> {
    const current = proof ?? (await this.readMembership(input));
    return this.work.run((store) =>
      withWatcherAudienceRetry(store, () => this.apply(store, input, current)),
    );
  }

  /** Checks live authority before replay and supplies it to the write when there is no receipt. */
  public async authorize(input: ApplyGitTaskStatusInput): Promise<DelegatedMembershipProof> {
    const proof = await this.readMembership(input);
    await this.work.run(async (store) => {
      const viewer = await this.memberships.require(
        proof,
        input.organizationId,
        input.mappingAuthorUserId,
        true,
      );
      await this.locateAuthorized(store, viewer, input);
    });
    return proof;
  }

  /** Gets the mapping author's current membership without holding task or membership locks. */
  private readMembership(input: ApplyGitTaskStatusInput): Promise<DelegatedMembershipProof> {
    return this.memberships.execute(input.organizationId, [input.mappingAuthorUserId]);
  }

  /** Holds the task and its live placement after rechecking current edit access. */
  private async locateAuthorized(
    store: TasksStore,
    viewer: Viewer,
    input: ApplyGitTaskStatusInput,
  ): Promise<LocatedTask> {
    const { task, placement } = await this.locator.locate(store, {
      organizationId: input.organizationId,
      viewer,
      taskKey: input.taskKey,
      edit: true,
      lock: true,
      archived: 'refuse',
      expectedVersions: null,
    });
    if (
      placement.list.archivedAt !== null ||
      task.snapshot.spaceId !== input.spaceId ||
      placement.space.id !== input.spaceId
    ) {
      throw new TaskRefusal({ reason: 'task-not-found' });
    }
    return { task, placement };
  }

  /** Performs the decision, the update and its ordinary side effects in one transaction. */
  private async apply(
    store: TasksStore,
    input: ApplyGitTaskStatusInput,
    proof: DelegatedMembershipProof,
  ): Promise<ApplyGitTaskStatusOutput> {
    const viewer: Viewer = await this.memberships.require(
      proof,
      input.organizationId,
      input.mappingAuthorUserId,
      true,
    );
    const request = {
      organizationId: input.organizationId,
      viewer,
      taskKey: input.taskKey,
      edit: true,
      lock: false,
      archived: 'refuse' as const,
      expectedVersions: null,
    };
    const candidate: LocatedTask = await this.locator.locate(store, {
      ...request,
      archived: 'allow',
    });
    const heldRoles: ReadonlyMap<string, MemberRole | null> = await this.watchers.holdCandidates(
      store,
      candidate.task.snapshot,
      viewer,
      input.status === 'done' ? candidate.task.snapshot.assigneeIds : [],
    );
    const { task, placement: current } = await this.locateAuthorized(store, viewer, input);
    const result = {
      taskId: task.snapshot.id,
      listId: task.snapshot.listId,
      spaceId: task.snapshot.spaceId,
    };
    if (
      !canApplyGitStatus(task.snapshot, input.status, current.space.statuses) ||
      input.status === null
    ) {
      return { ...result, disposition: 'no_op' };
    }

    const now: Date = await store.clock.now();
    let preview: TaskUpdate;
    try {
      preview = task.update({ status: input.status }, current.space.statuses, now);
    } catch (error: unknown) {
      if (error instanceof DomainError && !(error instanceof InvalidTaskError)) {
        return { ...result, disposition: 'no_op' };
      }
      throw error;
    }
    if (
      preview.nextOccurrence !== undefined &&
      task.snapshot.assigneeIds.some((id) => !heldRoles.has(id))
    ) {
      throw new WatcherAudienceChanged();
    }
    const candidates: readonly AssigneeCandidate[] =
      preview.nextOccurrence === undefined
        ? []
        : task.snapshot.assigneeIds.map((userId) => ({
            userId,
            role: heldRoles.get(userId) ?? null,
          }));
    const audience = await this.watchers.forHeldTask(store, preview.task.snapshot, heldRoles);
    const scheduled = await this.recurrence.prepare(
      task,
      { status: input.status },
      current.space.statuses,
      now,
    );
    const actor: TaskActor = { type: 'git', id: input.integrationId, provider: input.provider };
    await this.writer.commitAs(store, task, scheduled.update, actor, now, audience);
    await this.recurrence.createSuccessor(
      store,
      scheduled,
      current.space.statuses,
      candidates,
      actor,
      now,
    );
    return { ...result, disposition: 'applied' };
  }
  // #endregion
}

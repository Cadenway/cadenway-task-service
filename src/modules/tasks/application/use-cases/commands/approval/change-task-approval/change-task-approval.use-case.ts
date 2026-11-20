import { canWriteTasksOf } from '../../../../../domain/policies/task/task-write.policy.js';
import type { AssigneeCandidate } from '../../../../../domain/value-objects/member/assignee-candidate.value-object.js';
import type { MemberRole } from '../../../../../domain/value-objects/member/member-role.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { WatcherAudienceChanged } from '../../../../models/watcher/watcher-audience-changed.model.js';
import { TaskApprovalTaskRefusal } from '../../../../models/approval/task-approval-task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { taskApprovalRefusal } from '../../../../services/approval/task-approval-refusal.service.js';
import { TaskChangeWriter } from '../../../../services/task/task-change-writer.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import { TaskMovePlanner } from '../../../../services/task/task-move-planner.service.js';
import { TaskOccurrenceScheduler } from '../../../../services/task/task-occurrence-scheduler.service.js';
import { TaskRuleGuard } from '../../../../services/task/task-rule-guard.service.js';
import { EffectiveWatchers } from '../../../../services/watcher/effective-watchers.service.js';
import { withWatcherAudienceRetry } from '../../../../services/watcher/watcher-audience-retry.service.js';
import type { ChangeTaskApprovalInput } from './change-task-approval.input.js';
import type { ChangeTaskApprovalOutput } from './change-task-approval.output.js';

/** Coordinates an approval change with the task's version, status and normal task facts. */
export class ChangeTaskApproval {
  // #region Properties
  /** Task access and existing mutation services. */
  private readonly viewers: ViewerResolver;
  private readonly locator: TaskLocator;
  private readonly planner: TaskMovePlanner;
  private readonly watchers: EffectiveWatchers;
  private readonly recurrence: TaskOccurrenceScheduler;
  private readonly writer: TaskChangeWriter = new TaskChangeWriter();
  private readonly rules: TaskRuleGuard = new TaskRuleGuard();
  // #endregion

  // #region Constructor
  /** Binds the existing task transaction and directory operations. */
  public constructor(
    private readonly work: TasksUnitOfWork,
    members: MemberDirectory,
    private readonly spaces: SpaceDirectory,
  ) {
    this.viewers = new ViewerResolver(members);
    this.locator = new TaskLocator(spaces);
    this.planner = new TaskMovePlanner(spaces);
    this.watchers = new EffectiveWatchers(members, spaces);
    this.recurrence = new TaskOccurrenceScheduler(spaces);
  }
  // #endregion

  // #region Methods
  /** Exposes a portable task refusal without leaking the task module's internal error type. */
  public static taskRefusalOf(
    error: unknown,
  ): { readonly reason: string; readonly details: Readonly<Record<string, unknown>> } | null {
    return error instanceof TaskApprovalTaskRefusal
      ? { reason: error.reason, details: error.details }
      : null;
  }

  /** Runs the callback and all resulting writes under a single tenant transaction. */
  public execute<TResult>(
    input: ChangeTaskApprovalInput,
    operation: {
      discoverReviewerIds(taskId: string): Promise<readonly string[]>;
      decide(context: ChangeTaskApprovalOutput): Promise<{
        readonly changed: boolean;
        readonly status: 'progress' | 'done' | null;
        readonly finish: (context: ChangeTaskApprovalOutput) => Promise<TResult>;
      }>;
    },
  ): Promise<TResult> {
    return this.work
      .run((store) => withWatcherAudienceRetry(store, () => this.apply(store, input, operation)))
      .catch((error: unknown) => {
        throw taskApprovalRefusal(error);
      });
  }

  private async apply<TResult>(
    store: TasksStore,
    input: ChangeTaskApprovalInput,
    operation: {
      discoverReviewerIds(taskId: string): Promise<readonly string[]>;
      decide(context: ChangeTaskApprovalOutput): Promise<{
        readonly changed: boolean;
        readonly status: 'progress' | 'done' | null;
        readonly finish: (context: ChangeTaskApprovalOutput) => Promise<TResult>;
      }>;
    },
  ): Promise<TResult> {
    const viewer: Viewer = await this.viewers.resolve(
      input.organizationId,
      input.actorUserId,
      true,
    );
    const request = {
      organizationId: input.organizationId,
      viewer,
      taskKey: input.taskKey,
      edit: true,
      lock: false,
      archived: 'allow' as const,
      expectedVersions: null,
    };
    const seen = await this.locator.locate(store, request);
    const reviewerIds = (await operation.discoverReviewerIds(seen.task.snapshot.id)).map((id) =>
      id.toLowerCase(),
    );
    const requested = input.reviewerUserIds.map((id) => id.toLowerCase());
    const heldRoles: ReadonlyMap<string, MemberRole | null> = await this.watchers.holdCandidates(
      store,
      seen.task.snapshot,
      viewer,
      [...reviewerIds, ...requested, ...seen.task.snapshot.assigneeIds],
    );
    const { task } = await this.locator.locate(store, {
      ...request,
      lock: true,
      archived: 'refuse',
      expectedVersions: input.expectedVersions,
    });
    const state = task.snapshot;
    await this.planner.holdPlacement(input.organizationId, viewer, state.listId);
    const placement = await this.spaces.findVisibleList(input.organizationId, viewer, state.listId);
    if (placement === null) throw new WatcherAudienceChanged();

    const currentReviewerIds = (await operation.discoverReviewerIds(state.id)).map((id) =>
      id.toLowerCase(),
    );
    const candidates = [...new Set([...currentReviewerIds, ...requested])];
    if ([...candidates, ...state.assigneeIds].some((id) => !heldRoles.has(id))) {
      throw new WatcherAudienceChanged();
    }
    const eligibleReviewerIds: string[] = [];
    for (const userId of candidates) {
      const role = heldRoles.get(userId);
      if (role === undefined || role === null) continue;
      const target = await this.spaces.findVisibleList(
        input.organizationId,
        { userId, role },
        state.listId,
      );
      if (target !== null && canWriteTasksOf(target.list.callerRole))
        eligibleReviewerIds.push(userId);
    }
    const watcherIds = await this.watchers.forHeldTask(store, state, heldRoles);
    const now = await store.clock.now();
    const context: ChangeTaskApprovalOutput = {
      taskId: state.id,
      taskKey: state.key.format(),
      organizationId: state.organizationId,
      listId: state.listId,
      spaceId: state.spaceId,
      milestone: state.milestone === true,
      status: state.status,
      version: state.version,
      instant: now,
      eligibleReviewerIds,
      watcherIds,
    };
    const decision = await operation.decide(context);
    if (!decision.changed) return decision.finish(context);

    const scheduled = await this.recurrence.prepare(
      task,
      decision.status === null ? {} : { status: decision.status },
      placement.space.statuses,
      now,
    );
    const update = this.rules.apply(() => task.markApprovalChanged(scheduled.update, now));
    await this.writer.commit(store, task, update, input.actorUserId, now, watcherIds);
    const assignees: readonly AssigneeCandidate[] = state.assigneeIds.map((userId) => ({
      userId,
      role: heldRoles.get(userId) ?? null,
    }));
    await this.recurrence.createSuccessor(
      store,
      { ...scheduled, update },
      placement.space.statuses,
      assignees,
      { type: 'user', id: input.actorUserId },
      now,
    );
    return decision.finish({
      ...context,
      version: update.task.snapshot.version,
      status: update.task.snapshot.status,
    });
  }
  // #endregion
}

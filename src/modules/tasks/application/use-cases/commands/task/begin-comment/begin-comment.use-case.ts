import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import { TaskRuleGuard } from '../../../../services/task/task-rule-guard.service.js';
import type { BeginCommentInput } from './begin-comment.input.js';
import type { BeginCommentOutput } from './begin-comment.output.js';

/** Authorizes a comment, locks the task and advances its version in the caller's transaction. */
export class BeginComment {
  // #region Properties
  /** Task transaction. */
  private readonly unit: TasksUnitOfWork;

  /** Resolves the actor. */
  private readonly viewers: ViewerResolver;

  /** Recipient membership directory. */
  private readonly members: MemberDirectory;

  /** Holds the task placement against access changes. */
  private readonly spaces: SpaceDirectory;

  /** Resolves visibility and locks. */
  private readonly locator: TaskLocator;

  /** Maps task domain refusals. */
  private readonly rules: TaskRuleGuard;
  // #endregion

  // #region Constructor
  /** Binds the task transaction and directories. */
  public constructor(unit: TasksUnitOfWork, members: MemberDirectory, spaces: SpaceDirectory) {
    this.unit = unit;
    this.members = members;
    this.spaces = spaces;
    this.viewers = new ViewerResolver(members);
    this.locator = new TaskLocator(spaces);
    this.rules = new TaskRuleGuard();
  }
  // #endregion

  // #region Methods
  /** Checks the role before recipient or reply validation; the caller must roll back on refusal. */
  public async execute(input: BeginCommentInput): Promise<BeginCommentOutput> {
    try {
      return await this.unit.run(async (store: TasksStore): Promise<BeginCommentOutput> => {
        const viewer: Viewer = await this.viewers.resolve(
          input.organizationId,
          input.actorUserId,
          true,
        );
        // Membership locks precede the task lock; eligibility is not disclosed here.
        const unavailableRecipientIds: string[] = [];
        for (const userId of [...new Set(input.recipientIds ?? [])].sort()) {
          if (
            userId.toLowerCase() !== input.actorUserId.toLowerCase() &&
            (await this.members.roleOf(input.organizationId, userId, true)) === null
          )
            unavailableRecipientIds.push(userId);
        }
        const request = {
          organizationId: input.organizationId,
          viewer,
          taskKey: input.taskKey,
          edit: false,
          archived: 'allow' as const,
          expectedVersions: null,
        };
        const seen: LocatedTask = await this.locator.locate(store, { ...request, lock: false });
        if (
          seen.placement.list.callerRole !== 'edit' &&
          seen.placement.list.callerRole !== 'comment'
        )
          return { outcome: 'role-insufficient', role: 'view' };
        const locked: LocatedTask = await this.locator.locate(store, { ...request, lock: true });
        if (
          locked.placement.list.callerRole !== 'edit' &&
          locked.placement.list.callerRole !== 'comment'
        )
          return { outcome: 'role-insufficient', role: 'view' };
        const [held] = await this.spaces.lockTrashLists(
          input.organizationId,
          [locked.task.snapshot.listId],
          'hold',
          viewer,
        );
        if (held?.outcome !== 'live' || held.role === null) return { outcome: 'task-not-found' };
        if (held.role !== 'edit' && held.role !== 'comment')
          return { outcome: 'role-insufficient', role: 'view' };
        const now = await store.clock.now();
        const next = this.rules.apply(() => locked.task.withCommentChange(now));
        await store.tasks.save(locked.task, next);
        return {
          outcome: 'ready',
          taskId: next.snapshot.id,
          spaceId: next.snapshot.spaceId,
          listId: next.snapshot.listId,
          version: next.snapshot.version,
          instant: now,
          unavailableRecipientIds,
        };
      });
    } catch (error: unknown) {
      if (error instanceof TaskRefusal) {
        if (error.refusal.reason === 'organization-not-found')
          return { outcome: 'organization-not-found' };
        if (error.refusal.reason === 'task-archived') return { outcome: 'task-archived' };
        if (error.refusal.reason === 'task-not-found' || error.refusal.reason === 'task-trashed')
          return { outcome: 'task-not-found' };
      }
      throw error;
    }
  }
  // #endregion
}

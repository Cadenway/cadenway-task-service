import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { AccessRole } from '../../../../../domain/value-objects/access/access-role.value-object.js';
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
import { EffectiveWatchers } from '../../../../services/watcher/effective-watchers.service.js';
import { withWatcherAudienceRetry } from '../../../../services/watcher/watcher-audience-retry.service.js';
import type { BeginCommentInput } from './begin-comment.input.js';
import type { BeginCommentOutput } from './begin-comment.output.js';

/** The authorized task and audience before the version is advanced, or a refusal. */
type PreparedComment =
  | {
      readonly outcome: 'locked';
      readonly task: Task;
      readonly unavailableRecipientIds: readonly string[];
      readonly watcherIds: readonly string[];
      readonly replyRecipientId?: string;
      readonly canModerateAutomationComment?: boolean;
    }
  | Exclude<BeginCommentOutput, { outcome: 'ready' }>;

/** Authorizes a comment, locks the task and advances its version in the caller's transaction. */
export class BeginComment {
  // #region Properties
  /** Task transaction. */
  private readonly unit: TasksUnitOfWork;

  /** Resolves the actor. */
  private readonly viewers: ViewerResolver;

  /** Holds the task placement against access changes. */
  private readonly spaces: SpaceDirectory;

  /** Resolves visibility and locks. */
  private readonly locator: TaskLocator;

  /** Maps task domain refusals. */
  private readonly rules: TaskRuleGuard;

  /** Computes the creation audience under the task and placement locks. */
  private readonly watchers: EffectiveWatchers;
  // #endregion

  // #region Constructor
  /** Binds the task transaction and directories. */
  public constructor(unit: TasksUnitOfWork, members: MemberDirectory, spaces: SpaceDirectory) {
    this.unit = unit;
    this.spaces = spaces;
    this.viewers = new ViewerResolver(members);
    this.locator = new TaskLocator(spaces);
    this.rules = new TaskRuleGuard();
    this.watchers = new EffectiveWatchers(members, spaces);
  }
  // #endregion

  // #region Methods
  /** Checks delegated placement under the write locks before an idempotent receipt is replayed. */
  public async authorize(
    input: Pick<BeginCommentInput, 'organizationId' | 'actorUserId' | 'taskKey'>,
  ): Promise<boolean> {
    try {
      return await this.unit.run(async (store) => {
        const result = await this.prepare(store, { ...input, requireEdit: true });
        return result.outcome === 'locked';
      });
    } catch (error: unknown) {
      if (error instanceof TaskRefusal) return false;
      throw error;
    }
  }

  /** Checks a human commenter's current authority without advancing the task version. */
  public async authorizeUser(
    input: Pick<BeginCommentInput, 'organizationId' | 'actorUserId' | 'taskKey'>,
  ): Promise<
    Exclude<BeginCommentOutput, { outcome: 'ready' }> | { readonly outcome: 'authorized' }
  > {
    try {
      return await this.unit.run(async (store) => {
        const result = await this.prepare(store, input);
        return result.outcome === 'locked' ? { outcome: 'authorized' } : result;
      });
    } catch (error: unknown) {
      if (error instanceof TaskRefusal) {
        if (error.refusal.reason === 'organization-not-found')
          return { outcome: 'organization-not-found' };
        if (error.refusal.reason === 'task-archived') return { outcome: 'task-archived' };
        if (error.refusal.reason === 'task-trashed')
          return { outcome: 'task-trashed', details: TaskRefusal.trashDetails(error.refusal) };
        if (error.refusal.reason === 'task-not-found') return { outcome: 'task-not-found' };
      }
      throw error;
    }
  }

  /** Checks the role before recipient or reply validation; the caller must roll back on refusal. */
  public async execute(input: BeginCommentInput): Promise<BeginCommentOutput> {
    try {
      return await this.unit.run(async (store: TasksStore): Promise<BeginCommentOutput> => {
        const prepare = (): Promise<PreparedComment> => this.prepare(store, input);
        const prepared =
          input.includeWatcherAudience === true
            ? await withWatcherAudienceRetry(store, prepare)
            : await prepare();
        if (prepared.outcome !== 'locked') return prepared;
        const {
          task,
          watcherIds,
          unavailableRecipientIds,
          replyRecipientId,
          canModerateAutomationComment,
        } = prepared;
        const now = await store.clock.now();
        const next = this.rules.apply(() => task.withCommentChange(now));
        await store.tasks.save(task, next);
        return {
          outcome: 'ready',
          taskId: next.snapshot.id,
          spaceId: next.snapshot.spaceId,
          listId: next.snapshot.listId,
          version: next.snapshot.version,
          instant: now,
          unavailableRecipientIds,
          watcherIds,
          ...(replyRecipientId === undefined ? {} : { replyRecipientId }),
          ...(canModerateAutomationComment === undefined ? {} : { canModerateAutomationComment }),
        };
      });
    } catch (error: unknown) {
      if (error instanceof TaskRefusal) {
        if (error.refusal.reason === 'organization-not-found')
          return { outcome: 'organization-not-found' };
        if (error.refusal.reason === 'task-archived') return { outcome: 'task-archived' };
        if (error.refusal.reason === 'task-trashed')
          return { outcome: 'task-trashed', details: TaskRefusal.trashDetails(error.refusal) };
        if (error.refusal.reason === 'task-not-found') return { outcome: 'task-not-found' };
      }
      throw error;
    }
  }

  /** Holds recipient memberships and confirms the audience before writing the task version. */
  private async prepare(store: TasksStore, input: BeginCommentInput): Promise<PreparedComment> {
    const viewer: Viewer = await this.viewers.resolve(
      input.organizationId,
      input.actorUserId,
      true,
    );
    const request = {
      organizationId: input.organizationId,
      viewer,
      taskKey: input.taskKey,
      edit: false,
      archived: 'allow' as const,
      expectedVersions: null,
    };
    const requiresEdit = input.requireEdit === true;
    const roleInsufficient = (role: AccessRole): boolean =>
      role === 'view' || (requiresEdit && role !== 'edit');
    const seen: LocatedTask = await this.locator.locate(store, { ...request, lock: false });
    if (roleInsufficient(seen.placement.list.callerRole)) {
      return { outcome: 'role-insufficient', role: seen.placement.list.callerRole };
    }
    const recipients = (input.recipientIds ?? []).map((userId) => userId.toLowerCase());
    const beforeReply = (await input.findReplyAuthor?.(seen.task.snapshot.id))?.toLowerCase();
    const heldRoles = await this.watchers.holdCandidates(
      store,
      seen.task.snapshot,
      viewer,
      beforeReply === undefined ? recipients : [...recipients, beforeReply],
      input.includeWatcherAudience === true,
    );
    const { task, placement } = await this.locator.locate(store, { ...request, lock: true });
    if (roleInsufficient(placement.list.callerRole)) {
      return { outcome: 'role-insufficient', role: placement.list.callerRole };
    }
    const [held] = await this.spaces.lockTrashLists(
      input.organizationId,
      [task.snapshot.listId],
      'hold',
      viewer,
    );
    if (held?.outcome !== 'live' || held.role === null) return { outcome: 'task-not-found' };
    if (roleInsufficient(held.role)) return { outcome: 'role-insufficient', role: held.role };
    const checksModerationAuthority = input.includeModerationAuthority === true;
    const currentPlacement =
      requiresEdit || checksModerationAuthority
        ? await this.spaces.findVisibleList(input.organizationId, viewer, task.snapshot.listId)
        : null;
    if (requiresEdit) {
      if (
        currentPlacement?.list.archivedAt !== null ||
        currentPlacement.space.id !== task.snapshot.spaceId
      ) {
        return { outcome: 'task-not-found' };
      }
      if (currentPlacement.list.callerRole !== 'edit') {
        return { outcome: 'role-insufficient', role: currentPlacement.list.callerRole };
      }
    }
    this.rules.apply((): void => {
      task.requireChangeable();
    });
    const watcherIds =
      input.includeWatcherAudience === true
        ? await this.watchers.forHeldTask(store, task.snapshot, heldRoles)
        : [];
    const afterReply = (await input.findReplyAuthor?.(task.snapshot.id))?.toLowerCase();
    const replyRecipientId =
      afterReply !== undefined &&
      (await this.watchers.heldRecipientCanRead(task.snapshot, afterReply, heldRoles))
        ? afterReply
        : undefined;
    return {
      outcome: 'locked',
      task,
      unavailableRecipientIds: [...new Set(recipients)].filter(
        (userId) => heldRoles.get(userId) === null,
      ),
      watcherIds,
      ...(replyRecipientId === undefined ? {} : { replyRecipientId }),
      ...(checksModerationAuthority
        ? {
            canModerateAutomationComment:
              held.role === 'edit' &&
              currentPlacement?.space.id === task.snapshot.spaceId &&
              currentPlacement.list.callerRole === 'edit' &&
              currentPlacement.space.callerCanManage,
          }
        : {}),
    };
  }
  // #endregion
}

import {
  canChangeWatcher,
  WATCHER_OVERRIDE_LIMIT,
} from '../../../../../domain/policies/watcher/watcher.policy.js';
import type { AccessRole } from '../../../../../domain/value-objects/access/access-role.value-object.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import { TaskRuleGuard } from '../../../../services/task/task-rule-guard.service.js';
import type { SetTaskWatcherInput } from './set-task-watcher.input.js';
import type { SetTaskWatcherOutput } from './set-task-watcher.output.js';

/** Changes one explicit subscription under the membership, task, space and list locks. */
export class SetTaskWatcher {
  // #region Properties
  /** The task's tenant transaction. */
  private readonly unit: TasksUnitOfWork;

  /** Current account memberships. */
  private readonly members: MemberDirectory;

  /** List visibility and access serialization. */
  private readonly spaces: SpaceDirectory;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Finds the visible task and validates its expected version. */
  private readonly locator: TaskLocator;

  /** Maps refusals from the task aggregate. */
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
  /** Persists a changed override, the next task version and its events atomically. */
  public async execute(input: SetTaskWatcherInput): Promise<SetTaskWatcherOutput> {
    return this.unit.run(async (store: TasksStore): Promise<SetTaskWatcherOutput> => {
      const actorUserId = input.actorUserId.toLowerCase();
      const userId = input.userId.toLowerCase();
      const viewer = await this.viewers.resolve(input.organizationId, actorUserId, true);
      const request = {
        organizationId: input.organizationId,
        viewer,
        taskKey: input.taskKey,
        edit: false,
        archived: 'allow' as const,
        expectedVersions: null,
      };
      const seen: LocatedTask = await this.locator.locate(store, { ...request, lock: false });
      this.requireRole(seen.placement.list.callerRole, actorUserId, userId);

      // Hold both existing memberships before the task. The recipient refusal follows the
      // actor's final authorization so the result cannot disclose membership to a viewer.
      const recipientRole =
        userId === actorUserId
          ? viewer.role
          : await this.members.roleOf(input.organizationId, userId, true);
      const { task } = await this.locator.locate(store, { ...request, lock: true });
      const { id, listId, organizationId, version } = task.snapshot;
      const [held] = await this.spaces.lockTrashLists(organizationId, [listId], 'hold', viewer);
      if (held?.outcome !== 'live' || held.role === null) {
        throw new TaskRefusal({ reason: 'task-not-found' });
      }
      this.requireRole(held.role, actorUserId, userId);
      this.rules.apply((): void => {
        task.requireChangeable();
      });
      this.locator.requireVersion(task, input.expectedVersions);

      if (
        recipientRole === null ||
        (userId !== actorUserId &&
          (await this.spaces.findVisibleList(
            organizationId,
            { userId, role: recipientRole },
            listId,
          )) === null)
      ) {
        throw new TaskRefusal({ reason: 'watcher-recipient-invalid' });
      }

      const overrides = await store.watcherOverrides.list(organizationId, id);
      const previous = overrides.find((override) => override.userId === userId);
      if (previous?.following === input.following) return { userId, version };
      if (previous === undefined && overrides.length >= WATCHER_OVERRIDE_LIMIT) {
        throw new TaskRefusal({ reason: 'watcher-limit-reached' });
      }

      const override = { userId, following: input.following };
      const now = await store.clock.now();
      const next = this.rules.apply(() => task.withWatcherChange(now));
      await store.watcherOverrides.set(organizationId, id, override);
      await store.tasks.save(task, next);
      const actor = { type: 'user' as const, id: actorUserId };
      await store.events.taskUpdated(next, ['watchers'], actor);
      await store.events.taskWatcherChanged(next, override, actor);
      return { userId, version: next.snapshot.version };
    });
  }

  /** Requires comment for self-service or edit to change another account. */
  private requireRole(role: AccessRole, actorUserId: string, userId: string): void {
    if (!canChangeWatcher(role, actorUserId, userId)) {
      throw new TaskRefusal({
        reason: 'role-insufficient',
        role,
        ...(actorUserId === userId ? { requiredRole: 'comment' as const } : {}),
      });
    }
  }
  // #endregion
}

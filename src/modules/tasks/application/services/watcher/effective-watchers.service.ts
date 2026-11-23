import { watcherCandidates } from '../../../domain/policies/watcher/watcher.policy.js';
import type { MemberRole } from '../../../domain/value-objects/member/member-role.value-object.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { TaskState } from '../../../domain/value-objects/task/task-state.value-object.js';
import type { ReadonlyTasksStore } from '../../models/transactions/readonly-tasks-store.model.js';
import type { MemberDirectory } from '../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../ports/outbound/spaces/space/space-directory.port.js';
import { WatcherAudienceChanged } from '../../models/watcher/watcher-audience-changed.model.js';

/** Resolves subscribers against current membership and list visibility in the caller's transaction. */
export class EffectiveWatchers {
  // #region Properties
  /** The local membership copy. */
  private readonly members: MemberDirectory;

  /** The source of list visibility. */
  private readonly spaces: SpaceDirectory;
  // #endregion

  // #region Constructor
  /** Binds the tenant-scoped directories. */
  public constructor(members: MemberDirectory, spaces: SpaceDirectory) {
    this.members = members;
    this.spaces = spaces;
  }
  // #endregion

  // #region Methods
  /** Returns the current audience in ascending user-ID order. */
  public async forTask(store: ReadonlyTasksStore, task: TaskState): Promise<readonly string[]> {
    const eligible: string[] = [];
    for (const userId of await this.candidates(store, task)) {
      const role = await this.members.roleOf(task.organizationId, userId);
      if (role !== null && (await this.canRead(task, { userId, role }))) eligible.push(userId);
    }
    return eligible;
  }

  /** Holds candidate memberships in account order before any task or placement lock. */
  public async holdCandidates(
    store: ReadonlyTasksStore,
    task: TaskState,
    viewer: Viewer,
    additionalIds: readonly string[] = [],
    includeWatchers = true,
  ): Promise<ReadonlyMap<string, MemberRole | null>> {
    const roles = new Map<string, MemberRole | null>([[viewer.userId.toLowerCase(), viewer.role]]);
    const watchers = includeWatchers ? await this.candidates(store, task) : [];
    const ids = [...new Set([...watchers, ...additionalIds])].sort();
    for (const userId of ids) {
      if (!roles.has(userId)) {
        roles.set(userId, await this.members.roleOf(task.organizationId, userId, true));
      }
    }
    return roles;
  }

  /** Computes the audience under the source task and final placement locks. */
  public async forHeldTask(
    store: ReadonlyTasksStore,
    task: TaskState,
    roles: ReadonlyMap<string, MemberRole | null>,
  ): Promise<readonly string[]> {
    const eligible: string[] = [];
    for (const userId of await this.candidates(store, task)) {
      if (await this.heldRecipientCanRead(task, userId, roles)) eligible.push(userId);
    }
    return eligible;
  }

  /** Resolves a held account against final placement, or retries for a newly found account. */
  public async heldRecipientCanRead(
    task: TaskState,
    userId: string,
    roles: ReadonlyMap<string, MemberRole | null>,
  ): Promise<boolean> {
    const role = roles.get(userId);
    if (role === undefined) throw new WatcherAudienceChanged();
    return role !== null && this.canRead(task, { userId, role });
  }

  /** Reads the bounded explicit overrides and combines them with the aggregate's defaults. */
  private async candidates(store: ReadonlyTasksStore, task: TaskState): Promise<readonly string[]> {
    const overrides = await store.watcherOverrides.list(task.organizationId, task.id);
    return watcherCandidates(task.createdBy, task.assigneeIds, overrides);
  }

  /** Checks the role under the placement of the write, or within the read snapshot. */
  private async canRead(task: TaskState, viewer: Viewer): Promise<boolean> {
    return (await this.spaces.findVisibleList(task.organizationId, viewer, task.listId)) !== null;
  }
  // #endregion
}

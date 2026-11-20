import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import type { SpaceStatusUse } from '../../../domain/value-objects/task/space-status-use.value-object.js';
import type { TaskPatch } from '../../../domain/value-objects/task/task-patch.value-object.js';
import type { TaskUpdate } from '../../../domain/value-objects/task/task-update.value-object.js';
import type { BulkTaskChange } from '../../models/bulk/bulk-task-change.model.js';
import type { BulkTaskCommand } from '../../models/bulk/bulk-task-command.model.js';
import { BulkTaskExpansionError } from '../../models/bulk/bulk-task-expansion.model.js';
import type { BulkTaskTargets } from '../../models/bulk/bulk-task-targets.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import { WatcherAudienceChanged } from '../../models/watcher/watcher-audience-changed.model.js';
import type { MemberDirectory } from '../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../ports/outbound/spaces/space/space-directory.port.js';
import { TaskRuleGuard } from '../task/task-rule-guard.service.js';
import { EffectiveWatchers } from '../watcher/effective-watchers.service.js';

/** Applies the ordinary task rules to the full selection before its writes begin. */
export class BulkTaskUpdates {
  // #region Properties
  /** Maps normal domain refusals. */
  private readonly rules = new TaskRuleGuard();

  /** Resolves the audience of status and milestone facts. */
  private readonly watchers: EffectiveWatchers;
  // #endregion

  // #region Constructor
  /** Binds audience resolution to the tenant directories. */
  public constructor(members: MemberDirectory, spaces: SpaceDirectory) {
    this.watchers = new EffectiveWatchers(members, spaces);
  }
  // #endregion

  // #region Methods
  /** Previews the updates, including each moved descendant and each required successor. */
  public async plan(
    store: TasksStore,
    targets: BulkTaskTargets,
    action: Exclude<BulkTaskCommand, { readonly type: 'duplicate' | 'trash' }>,
    now: Date,
  ): Promise<readonly BulkTaskChange[]> {
    if (action.type === 'move') return this.move(targets, now);
    const changes: BulkTaskChange[] = [];
    const roles = new Map(
      [...targets.candidates.values()].map(({ userId, role }) => [userId, role]),
    );
    let affected = 0;
    for (const { task: before, placement } of targets.selection) {
      const { statuses } = placement.space;
      const update = this.update(before, statuses, targets, action, now);
      if (update.changed.length === 0) continue;
      const watcherIds = update.changed.includes('status')
        ? await this.watchers.forHeldTask(store, update.task.snapshot, roles)
        : [];
      if (update.nextOccurrence === undefined) {
        changes.push({ before, update, watcherIds });
        affected += 1;
      } else {
        if (before.snapshot.assigneeIds.some((id): boolean => !roles.has(id))) {
          throw new WatcherAudienceChanged();
        }
        if (action.type !== 'status') throw new Error('A bulk recurrence needs a status patch.');
        changes.push({
          before,
          update,
          watcherIds,
          occurrence: { patch: this.statusPatch(action), statuses },
        });
        affected += 2;
      }
    }
    if (affected > BulkTaskExpansionError.maxAffected) throw new BulkTaskExpansionError();
    return changes;
  }

  /** Applies status, priority and assignment rules of a single task. */
  private update(
    task: Task,
    statuses: SpaceStatusUse,
    targets: BulkTaskTargets,
    action: Exclude<BulkTaskCommand, { readonly type: 'move' | 'duplicate' | 'trash' }>,
    now: Date,
  ): TaskUpdate {
    switch (action.type) {
      case 'status':
        return this.rules.apply(() => task.update(this.statusPatch(action), statuses, now));
      case 'priority':
        return this.rules.apply(() => task.update({ priority: action.priority }, statuses, now));
      case 'assign': {
        const candidate = targets.candidates.get(action.userId.toLowerCase());
        if (candidate === undefined) throw new Error('A bulk assignee was not held.');
        return this.rules.apply(() => task.assign(candidate, now));
      }
      case 'unassign':
        return this.rules.apply(() => task.unassign(action.userId.toLowerCase(), now));
    }
  }

  /** Omits untouched cancellation fields. */
  private statusPatch(action: Extract<BulkTaskCommand, { readonly type: 'status' }>): TaskPatch {
    return {
      status: action.status,
      ...(action.cancelReason === undefined ? {} : { cancelReason: action.cancelReason }),
      ...(action.cancelNote === undefined ? {} : { cancelNote: action.cancelNote }),
    };
  }

  /** Moves each selected root once while its live descendants retain their parents and statuses. */
  private move(targets: BulkTaskTargets, now: Date): readonly BulkTaskChange[] {
    const { destination } = targets;
    if (destination === null) throw new Error('A bulk move has no destination.');
    const list = { listId: destination.list.id, spaceId: destination.space.id };
    const changes: BulkTaskChange[] = [];
    for (const { root, members } of targets.trees) {
      const update = this.rules.apply(() => root.update({ list }, destination.space.statuses, now));
      if (update.changed.length === 0) continue;
      changes.push({ before: root, update, watcherIds: [] });
      for (const before of members.slice(1)) {
        const moved = this.rules.apply(() => before.followMove(list, now));
        if (moved.changed.length > 0) changes.push({ before, update: moved, watcherIds: [] });
      }
    }
    return changes;
  }
  // #endregion
}

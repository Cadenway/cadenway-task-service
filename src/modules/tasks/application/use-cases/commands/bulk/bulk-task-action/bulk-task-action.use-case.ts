import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { SubtaskParent } from '../../../../../domain/value-objects/subtask/subtask-parent.value-object.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { BulkTaskChange } from '../../../../models/bulk/bulk-task-change.model.js';
import type { BulkTaskResultEntry } from '../../../../models/bulk/bulk-task-result-entry.model.js';
import { BulkTaskTargetsChanged } from '../../../../models/bulk/bulk-task-targets-changed.model.js';
import type { BulkTaskTargets } from '../../../../models/bulk/bulk-task-targets.model.js';
import type { ScheduledTaskUpdate } from '../../../../models/task/scheduled-task-update.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import { WatcherAudienceChanged } from '../../../../models/watcher/watcher-audience-changed.model.js';
import type { TrashWrites } from '../../../../ports/outbound/feature/trash/trash-writes.port.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { BulkTaskTargetLocker } from '../../../../services/bulk/bulk-task-target-locker.service.js';
import { BulkTaskUpdates } from '../../../../services/bulk/bulk-task-updates.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskChangeWriter } from '../../../../services/task/task-change-writer.service.js';
import { TaskCopyCreator } from '../../../../services/task/task-copy-creator.service.js';
import { TaskOccurrenceScheduler } from '../../../../services/task/task-occurrence-scheduler.service.js';
import { TrashWriter } from '../../../../services/trash/trash-writer.service.js';
import type { BulkTaskActionInput } from './bulk-task-action.input.js';
import type { BulkTaskActionOutput } from './bulk-task-action.output.js';

/** Executes one action and its ordinary activity, outbox and jobs in a single tenant transaction. */
export class BulkTaskAction {
  // #region Properties
  /** Resolves the actor from the held membership. */
  private readonly viewers: ViewerResolver;

  /** Holds all rows used to authorize and plan the action. */
  private readonly locker: BulkTaskTargetLocker;

  /** Previews task changes and resolves their audience. */
  private readonly updates: BulkTaskUpdates;

  /** Reserves and writes recurring successors. */
  private readonly recurrence: TaskOccurrenceScheduler;

  /** Records an ordinary task change with its activity and events. */
  private readonly writer = new TaskChangeWriter();

  /** Duplicates a task with its checklist and creation facts. */
  private readonly copies = new TaskCopyCreator();

  /** Groups deletions in the usual trash entries. */
  private readonly trash = new TrashWriter();
  // #endregion

  // #region Constructor
  /** Binds the feature gate, tenant transaction and directories. */
  public constructor(
    private readonly writes: TrashWrites,
    private readonly unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    private readonly spaces: SpaceDirectory,
  ) {
    this.viewers = new ViewerResolver(members);
    this.locker = new BulkTaskTargetLocker(members, spaces);
    this.updates = new BulkTaskUpdates(members, spaces);
    this.recurrence = new TaskOccurrenceScheduler(spaces);
  }
  // #endregion

  // #region Methods
  /** Authorizes the entire selection before writing and preserves its order in the result. */
  public async execute(input: BulkTaskActionInput): Promise<BulkTaskActionOutput> {
    if (input.action.type === 'trash' && !this.writes.isEnabled()) {
      throw new TaskRefusal({ reason: 'task-not-found' });
    }
    return this.unitOfWork.run(async (store): Promise<BulkTaskActionOutput> => {
      const now = await store.clock.now();
      const { targets, changes } = await this.preflight(store, input, now);
      const affected =
        input.action.type === 'duplicate'
          ? await this.duplicate(store, targets, input, now)
          : input.action.type === 'trash'
            ? await this.trashSelection(store, targets, input, now)
            : await this.saveChanges(store, targets, changes, input, now);
      return {
        results: targets.selection.map(
          ({ task: { snapshot } }): BulkTaskResultEntry =>
            affected.get(snapshot.id) ?? {
              taskKey: snapshot.key.format(),
              version: snapshot.version,
            },
        ),
        affectedCount:
          affected.size +
          [...affected.values()].filter((entry): boolean => entry.successorKey !== undefined)
            .length,
      };
    });
  }

  /** Restarts discovery with a fresh lock set if relationships changed before the locks arrived. */
  private async preflight(
    store: TasksStore,
    input: BulkTaskActionInput,
    now: Date,
  ): Promise<{ readonly targets: BulkTaskTargets; readonly changes: readonly BulkTaskChange[] }> {
    const { organizationId, actorUserId, action, selection } = input;
    const viewer = await this.viewers.resolve(organizationId, actorUserId, true);
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await store.savepoint(async () => {
          const targets = await this.locker.lock(store, organizationId, viewer, selection, action);
          const changes =
            action.type === 'duplicate' || action.type === 'trash'
              ? []
              : await this.updates.plan(store, targets, action, now);
          return { targets, changes };
        });
      } catch (error: unknown) {
        if (
          attempt === 3 ||
          !(error instanceof BulkTaskTargetsChanged || error instanceof WatcherAudienceChanged)
        ) {
          throw error;
        }
      }
    }
  }

  /** Reserves successor keys in stable space order and commits each task's ordinary changes. */
  private async saveChanges(
    store: TasksStore,
    targets: BulkTaskTargets,
    changes: readonly BulkTaskChange[],
    input: BulkTaskActionInput,
    now: Date,
  ): Promise<ReadonlyMap<string, BulkTaskResultEntry>> {
    const results = new Map<string, BulkTaskResultEntry>();
    const schedules = new Map<string, ScheduledTaskUpdate>();
    const actor = { type: 'user', id: input.actorUserId } as const;
    const occurrences = changes
      .flatMap(({ before, occurrence }) =>
        occurrence === undefined ? [] : [{ before, ...occurrence }],
      )
      .sort((left, right): number =>
        left.before.snapshot.spaceId.localeCompare(right.before.snapshot.spaceId),
      );
    for (const { before, patch, statuses } of occurrences) {
      schedules.set(
        before.snapshot.id,
        await this.recurrence.prepare(before, patch, statuses, now),
      );
    }
    for (const { before, update, occurrence, watcherIds } of changes) {
      const planned = schedules.get(before.snapshot.id) ?? { update, successor: null };
      const { id, key, version } = planned.update.task.snapshot;
      await this.writer.commit(store, before, planned.update, actor.id, now, watcherIds);
      if (occurrence !== undefined) {
        const candidates = before.snapshot.assigneeIds.map((id) => {
          const candidate = targets.candidates.get(id);
          if (candidate === undefined) throw new Error('An occurrence assignee was not held.');
          return candidate;
        });
        await this.recurrence.createSuccessor(
          store,
          planned,
          occurrence.statuses,
          candidates,
          actor,
          now,
        );
      }
      results.set(id, {
        taskKey: key.format(),
        version,
        ...(planned.successor === null
          ? {}
          : { successorKey: planned.successor.key.format(), successorVersion: 1 }),
      });
    }
    return results;
  }

  /** Reuses the single-copy creator with fresh names, checklist and assignment facts. */
  private async duplicate(
    store: TasksStore,
    targets: BulkTaskTargets,
    input: BulkTaskActionInput,
    now: Date,
  ): Promise<ReadonlyMap<string, BulkTaskResultEntry>> {
    const results = new Map<string, BulkTaskResultEntry>();
    const keys = new Map<string, TaskKey>();
    const selected = [...targets.selection].sort((left, right): number =>
      left.task.snapshot.spaceId.localeCompare(right.task.snapshot.spaceId),
    );
    const assignees = [...targets.candidates.values()];
    for (const {
      task: {
        snapshot: { id, spaceId },
      },
    } of selected) {
      const allocated = await this.spaces.allocateKeys(input.organizationId, spaceId, 1);
      keys.set(id, TaskKey.of(allocated.prefix, allocated.firstNumber));
    }
    for (const { task: source, placement } of targets.selection) {
      const { id, listId, key, version, spaceId, parentId } = source.snapshot;
      const parent = parentId === null ? undefined : targets.locked.get(parentId);
      const attachment = await this.copyParent(
        store,
        input.organizationId,
        parent,
        listId,
        spaceId,
      );
      const copyKey = keys.get(id);
      if (copyKey === undefined) throw new Error('A bulk copy needs an allocated task key.');
      const copy = await this.copies.create(store, {
        source,
        placement,
        parent: attachment,
        key: copyKey,
        assignees,
        actor: { type: 'user', id: input.actorUserId },
        now,
      });
      results.set(id, {
        taskKey: key.format(),
        version,
        newTaskKey: copy.snapshot.key.format(),
        newTaskVersion: copy.snapshot.version,
      });
    }
    return results;
  }

  /** Checks the already locked live parent, including copies previously inserted in this transaction. */
  private async copyParent(
    store: TasksStore,
    organizationId: string,
    parent: Task | undefined,
    listId: string,
    spaceId: string,
  ): Promise<SubtaskParent | null> {
    if (parent === undefined) return null;
    const state = parent.snapshot;
    if (
      state.archive !== null ||
      state.trash !== null ||
      state.listId !== listId ||
      state.spaceId !== spaceId
    ) {
      return null;
    }
    return parent.asParent(
      await store.tasks.levelOf(organizationId, state.id),
      await store.tasks.childCount(organizationId, state.id),
    );
  }

  /** Makes one entry and one deferred cleanup per disjoint root. */
  private async trashSelection(
    store: TasksStore,
    targets: BulkTaskTargets,
    input: BulkTaskActionInput,
    now: Date,
  ): Promise<ReadonlyMap<string, BulkTaskResultEntry>> {
    const results = new Map<string, BulkTaskResultEntry>();
    for (const tree of await this.trash.trash(
      store,
      input.organizationId,
      targets.trees,
      { type: 'user', id: input.actorUserId },
      now,
    )) {
      for (const {
        snapshot: { id, key, version },
      } of tree.tasks) {
        results.set(id, { taskKey: key.format(), version, trashEntryId: tree.entry.id });
      }
      await store.jobs.dropTrashedTaskRequests(
        tree.entry.id,
        tree.tasks.map(({ snapshot }): string => snapshot.id),
      );
    }
    return results;
  }
  // #endregion
}

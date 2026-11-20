import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { watcherCandidates } from '../../../domain/policies/watcher/watcher.policy.js';
import type { AssigneeCandidate } from '../../../domain/value-objects/member/assignee-candidate.value-object.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { BulkTaskTargets } from '../../models/bulk/bulk-task-targets.model.js';
import type { BulkTaskCommand } from '../../models/bulk/bulk-task-command.model.js';
import type { BulkTaskSelection } from '../../models/bulk/bulk-task-selection.model.js';
import { BulkTaskTargetsChanged } from '../../models/bulk/bulk-task-targets-changed.model.js';
import type { ListPlacement } from '../../models/placement/list-placement.model.js';
import type { TrashListLock } from '../../models/placement/trash-list-lock.model.js';
import type { LocateRequest } from '../../models/task/locate-request.model.js';
import type { LocatedTask } from '../../models/task/located-task.model.js';
import { TaskRefusal } from '../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import { WatcherAudienceChanged } from '../../models/watcher/watcher-audience-changed.model.js';
import type { MemberDirectory } from '../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../ports/outbound/spaces/space/space-directory.port.js';
import { AssigneeChecker } from '../member/assignee-checker.service.js';
import { TaskEditGuard } from '../task/task-edit-guard.service.js';
import { TaskLocator } from '../task/task-locator.service.js';
import { BulkTaskTrees } from './bulk-task-trees.service.js';

/** Holds member, task and placement locks in the order shared with ordinary writers. */
export class BulkTaskTargetLocker {
  // #region Properties
  /** Checks tasks and conditional versions at discovery and once locked. */
  private readonly locator: TaskLocator;

  /** Holds all candidate memberships in account order. */
  private readonly assignees: AssigneeChecker;

  /** Enforces the effective edit role for source and destination lists. */
  private readonly editing = new TaskEditGuard();

  /** Discovers and collapses the move and trash expansions. */
  private readonly trees = new BulkTaskTrees();
  // #endregion

  // #region Constructor
  /** Binds the directories of current members and placements. */
  public constructor(
    members: MemberDirectory,
    private readonly spaces: SpaceDirectory,
  ) {
    this.locator = new TaskLocator(spaces);
    this.assignees = new AssigneeChecker(members);
  }
  // #endregion

  // #region Methods
  /** Resolves every selected task before taking task locks, and rechecks every one under them. */
  public async lock(
    store: TasksStore,
    organizationId: string,
    viewer: Viewer,
    selection: readonly BulkTaskSelection[],
    action: BulkTaskCommand,
  ): Promise<BulkTaskTargets> {
    const requests = selection.map((entry): LocateRequest => ({
      organizationId,
      viewer,
      taskKey: entry.taskKey,
      edit: true,
      lock: false,
      archived: 'refuse',
      expectedVersions: entry.version === undefined ? null : [entry.version],
    }));
    const observed = new Map<LocateRequest, LocatedTask>();
    for (const request of requests) {
      observed.set(request, await this.locator.locate(store, request));
    }

    const destinationId = action.type === 'move' ? action.listId.toLowerCase() : null;
    if (destinationId !== null) {
      await this.placement(organizationId, viewer, destinationId, 'list-not-found');
    }

    const sources = [...observed.values()].map(({ task }): Task => task);
    const candidates = await this.holdCandidates(store, organizationId, viewer, sources, action);
    const expanded = this.trees.ids(
      await this.trees.discover(
        store,
        organizationId,
        sources,
        action.type === 'trash',
        destinationId,
      ),
    );
    const ids = new Set([...expanded, ...sources.map(({ snapshot }): string => snapshot.id)]);
    if (action.type === 'duplicate') {
      for (const {
        snapshot: { parentId },
      } of sources) {
        if (parentId !== null) ids.add(parentId);
      }
    }

    const tasks = await store.tasks.lockByIds(
      organizationId,
      [...ids].sort(),
      action.type !== 'trash',
    );
    const locked = new Map(tasks.map((task): [string, Task] => [task.snapshot.id, task]));
    const { selection: selected, destination } = await this.confirm(
      store,
      organizationId,
      viewer,
      observed,
      locked,
      destinationId,
    );
    const current = selected.map(({ task }): Task => task);
    const trees = await this.trees.discover(
      store,
      organizationId,
      current,
      action.type === 'trash',
      destinationId,
    );
    for (const id of this.trees.ids(trees)) {
      if (!locked.has(id)) throw new BulkTaskTargetsChanged();
    }
    if (action.type === 'duplicate') {
      for (const {
        snapshot: { parentId, assigneeIds },
      } of current) {
        if (parentId !== null && !ids.has(parentId)) throw new BulkTaskTargetsChanged();
        if (assigneeIds.some((id): boolean => !candidates.has(id)))
          throw new WatcherAudienceChanged();
      }
    }
    return {
      selection: selected,
      trees: this.trees.roots(trees, locked),
      locked,
      destination,
      candidates,
    };
  }

  /** Holds all audience and assignment candidates in one globally ordered pass. */
  private async holdCandidates(
    store: TasksStore,
    organizationId: string,
    viewer: Viewer,
    tasks: readonly Task[],
    action: BulkTaskCommand,
  ): Promise<ReadonlyMap<string, AssigneeCandidate>> {
    const ids = new Set<string>();
    if (action.type === 'assign') ids.add(action.userId.toLowerCase());
    for (const { snapshot: task } of tasks) {
      if (action.type === 'duplicate' || (action.type === 'status' && action.status === 'done')) {
        for (const id of task.assigneeIds) ids.add(id);
      }
      if (action.type === 'status') {
        const overrides = await store.watcherOverrides.list(organizationId, task.id);
        for (const id of watcherCandidates(task.createdBy, task.assigneeIds, overrides))
          ids.add(id);
      }
    }
    const actorId = viewer.userId.toLowerCase();
    ids.delete(actorId);
    const candidates = [
      { userId: actorId, role: viewer.role },
      ...(await this.assignees.candidates(organizationId, [...ids], true)),
    ];
    return new Map(
      candidates.map((candidate): [string, AssigneeCandidate] => [candidate.userId, candidate]),
    );
  }

  /** Holds every affected placement and confirms each selected key against the locked state. */
  private async confirm(
    store: TasksStore,
    organizationId: string,
    viewer: Viewer,
    observed: ReadonlyMap<LocateRequest, LocatedTask>,
    locked: ReadonlyMap<string, Task>,
    destinationId: string | null,
  ): Promise<{
    readonly selection: readonly LocatedTask[];
    readonly destination: ListPlacement | null;
  }> {
    const ids = new Set<string>(destinationId === null ? [] : [destinationId]);
    const current = new Map<LocateRequest, Task>();
    for (const [request, located] of observed) {
      const task = locked.get(located.task.snapshot.id);
      if (task === undefined) {
        await this.locator.locate(store, request);
        throw new BulkTaskTargetsChanged();
      }
      if (task.isInTrash) await this.locator.confirm(store, request, located, task);
      ids.add(task.snapshot.listId);
      current.set(request, task);
    }
    // Check roles below with targeted reads under these locks.
    const held = new Map(
      (await this.spaces.lockTrashLists(organizationId, [...ids], 'hold', null)).map((list) => [
        list.listId,
        list,
      ]),
    );
    const placements = new Map<string, ListPlacement>();
    const confirmed: LocatedTask[] = [];
    for (const [request, task] of current) {
      const { listId } = task.snapshot;
      if (!placements.has(listId)) {
        this.requireLive(held.get(listId), 'task-not-found');
        placements.set(
          listId,
          await this.placement(organizationId, viewer, listId, 'task-not-found'),
        );
      }
      const placement = placements.get(listId);
      if (placement === undefined) throw new Error('The selected task placement was not held.');
      confirmed.push(await this.locator.confirm(store, request, { task, placement }, task));
    }
    if (destinationId === null) return { selection: confirmed, destination: null };
    this.requireLive(held.get(destinationId), 'list-not-found');
    const destination =
      placements.get(destinationId) ??
      (await this.placement(organizationId, viewer, destinationId, 'list-not-found'));
    return { selection: confirmed, destination };
  }

  /** Refuses a placement that no longer exists or was deleted before its lock arrived. */
  private requireLive(
    list: TrashListLock | undefined,
    reason: 'task-not-found' | 'list-not-found',
  ): void {
    if (list?.outcome !== 'live') throw new TaskRefusal({ reason });
  }

  /** Uses the current role and statuses for a placement; hidden lists remain unknown. */
  private async placement(
    organizationId: string,
    viewer: Viewer,
    listId: string,
    reason: 'task-not-found' | 'list-not-found',
  ): Promise<ListPlacement> {
    const placement = await this.spaces.findVisibleList(organizationId, viewer, listId);
    if (placement === null) throw new TaskRefusal({ reason });
    this.editing.requireEdit(placement.list);
    return placement;
  }
  // #endregion
}

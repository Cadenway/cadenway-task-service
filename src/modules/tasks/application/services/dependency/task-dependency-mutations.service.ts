import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { EventActor } from '../../models/actor/event-actor.model.js';
import type { DependencyActor } from '../../models/dependency/dependency-actor.model.js';
import type { TrashListLock } from '../../models/placement/trash-list-lock.model.js';
import type { LocateRequest } from '../../models/task/locate-request.model.js';
import type { LocatedTask } from '../../models/task/located-task.model.js';
import { TaskRefusal } from '../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../ports/outbound/spaces/space/space-directory.port.js';
import { ViewerResolver } from '../member/viewer-resolver.service.js';
import { TaskLocator } from '../task/task-locator.service.js';
import { TaskRuleGuard } from '../task/task-rule-guard.service.js';

/** What an unavailable counterpart means for this operation. */
type MissingCounterpart = 'task-not-found' | 'dependency-not-found';

/** The write guard shared by dependency creation and removal. */
export class TaskDependencyMutations {
  // #region Properties
  /** Resolves and holds the participating account's membership. */
  private readonly viewers: ViewerResolver;

  /** Reads tasks by key with the module's standard privacy and archive rules. */
  private readonly locator: TaskLocator;

  /** Maps aggregate refusals to the module's HTTP-neutral error reasons. */
  private readonly rules: TaskRuleGuard = new TaskRuleGuard();
  // #endregion

  // #region Constructor
  /**
   * @param members - Membership directory of the current tenant.
   * @param spaces - Task placements and their lock protocol.
   */
  public constructor(
    members: MemberDirectory,
    private readonly spaces: SpaceDirectory,
  ) {
    this.viewers = new ViewerResolver(members);
    this.locator = new TaskLocator(spaces);
  }
  // #endregion

  // #region Methods
  /**
   * Reads the anchor without a task lock after resolving the actor.
   *
   * @param store - The tenant transaction.
   * @param input - The actor and the anchor key.
   * @returns The verified viewer and the initially authorized anchor.
   */
  public async anchor(
    store: TasksStore,
    input: DependencyActor,
  ): Promise<{ readonly viewer: Viewer; readonly anchor: LocatedTask }> {
    const viewer: Viewer = await this.viewers.resolve(
      input.organizationId,
      input.actorUserId,
      true,
    );
    const anchor: LocatedTask = await this.locator.locate(store, this.request(input, viewer));
    return { viewer, anchor };
  }

  /**
   * Resolves the prospective counterpart without disclosing its trash metadata.
   *
   * @param store - The tenant transaction.
   * @param input - The actor and the counterpart key in the taskKey field.
   * @param viewer - The verified acting member.
   * @param missing - The generic refusal used when the counterpart is unavailable.
   * @returns The initially authorized counterpart.
   */
  public async counterpart(
    store: TasksStore,
    input: DependencyActor,
    viewer: Viewer,
    missing: MissingCounterpart,
  ): Promise<LocatedTask> {
    try {
      return await this.locator.locate(store, this.request(input, viewer));
    } catch (error: unknown) {
      if (
        error instanceof TaskRefusal &&
        (error.refusal.reason === 'task-not-found' || error.refusal.reason === 'task-trashed')
      ) {
        throw new TaskRefusal({ reason: missing });
      }
      throw error;
    }
  }

  /**
   * Locks both tasks in one ordered query and checks edit on their current placements.
   *
   * @param store - The tenant transaction, already holding the organization graph lock.
   * @param input - The actor and anchor key.
   * @param viewer - The verified acting member.
   * @param anchor - Initially authorized anchor.
   * @param other - Initially authorized counterpart.
   * @param expectedVersions - Accepted anchor versions, or null when unrestricted.
   * @param missing - The generic refusal used for an unavailable counterpart.
   * @returns Both authorized tasks after locking.
   */
  public async hold(
    store: TasksStore,
    input: DependencyActor,
    viewer: Viewer,
    anchor: LocatedTask,
    other: LocatedTask,
    expectedVersions: readonly number[] | null,
    missing: MissingCounterpart,
  ): Promise<{ readonly anchor: Task; readonly other: Task }> {
    const tasks: readonly Task[] = await store.tasks.lockByIds(
      input.organizationId,
      [anchor.task.snapshot.id, other.task.snapshot.id],
      false,
    );
    const lockedAnchor: Task | undefined = tasks.find(
      (task: Task) => task.snapshot.id === anchor.task.snapshot.id,
    );
    if (lockedAnchor === undefined) throw new TaskRefusal({ reason: 'task-not-found' });
    if (lockedAnchor.isInTrash) {
      await this.locator.confirm(store, this.request(input, viewer), anchor, lockedAnchor);
    }
    const lockedOther: Task | undefined = tasks.find(
      (task: Task) => task.snapshot.id === other.task.snapshot.id,
    );
    if (lockedOther === undefined || lockedOther.isInTrash)
      throw new TaskRefusal({ reason: missing });
    const placements: readonly TrashListLock[] = await this.spaces.lockTrashLists(
      input.organizationId,
      [...new Set([lockedAnchor.snapshot.listId, lockedOther.snapshot.listId])].sort(),
      'hold',
      viewer,
    );
    this.requirePlacement(placements, lockedAnchor.snapshot.listId, 'task-not-found');
    this.requirePlacement(placements, lockedOther.snapshot.listId, missing);
    this.rules.apply((): void => {
      lockedAnchor.requireChangeable();
      lockedOther.requireChangeable();
    });
    this.locator.requireVersion(lockedAnchor, expectedVersions);
    return { anchor: lockedAnchor, other: lockedOther };
  }

  /**
   * Advances both endpoint versions and records the graph change transactionally.
   *
   * @param store - The tenant transaction with both endpoint locks.
   * @param action - Whether the edge was added or removed.
   * @param dependencyId - Id of the affected edge.
   * @param blocker - Task at the origin of the edge.
   * @param blocked - Task at the destination of the edge.
   * @param viewer - The authorized acting member.
   * @param anchorId - The task for which the client expects its resulting version.
   * @returns The anchor's committed version.
   */
  public async recordChange(
    store: TasksStore,
    action: 'added' | 'removed',
    dependencyId: string,
    blocker: Task,
    blocked: Task,
    viewer: Viewer,
    anchorId: string,
  ): Promise<number> {
    const now: Date = await store.clock.now();
    const nextBlocker: Task = blocker.withDependencyChange(now);
    const nextBlocked: Task = blocked.withDependencyChange(now);
    await store.tasks.save(blocker, nextBlocker);
    await store.tasks.save(blocked, nextBlocked);
    const actor: EventActor = { type: 'user', id: viewer.userId };
    await store.events.taskUpdated(nextBlocker, ['dependencies'], actor);
    await store.events.taskUpdated(nextBlocked, ['dependencies'], actor);
    await store.events.dependencyChanged(action, dependencyId, nextBlocker, nextBlocked, actor);
    return anchorId === nextBlocker.snapshot.id
      ? nextBlocker.snapshot.version
      : nextBlocked.snapshot.version;
  }

  /**
   * Builds an unlocked request with the module's ordinary task access rules.
   *
   * @param input - The requested task key and organization.
   * @param viewer - The verified acting member.
   * @returns A request leaving the version check until after locking.
   */
  private request(input: DependencyActor, viewer: Viewer): LocateRequest {
    return {
      organizationId: input.organizationId,
      viewer,
      taskKey: input.taskKey,
      edit: true,
      lock: false,
      archived: 'refuse',
      expectedVersions: null,
    };
  }

  /**
   * Applies the role read under placement locks.
   *
   * @param placements - Current locked placements.
   * @param listId - The placement of the locked task.
   * @param missing - Generic reason for a deleted, missing or invisible placement.
   */
  private requirePlacement(
    placements: readonly TrashListLock[],
    listId: string,
    missing: MissingCounterpart,
  ): void {
    const lock: TrashListLock | undefined = placements.find(
      (placement: TrashListLock) => placement.listId === listId,
    );
    if (lock?.outcome !== 'live' || lock.role === null) {
      throw new TaskRefusal({ reason: missing });
    }
    if (lock.role !== 'edit') {
      throw new TaskRefusal({ reason: 'role-insufficient', role: lock.role });
    }
  }
  // #endregion
}

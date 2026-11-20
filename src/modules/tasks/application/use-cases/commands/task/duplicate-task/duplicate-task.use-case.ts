import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { AssigneeCandidate } from '../../../../../domain/value-objects/member/assignee-candidate.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { SubtaskParent } from '../../../../../domain/value-objects/subtask/subtask-parent.value-object.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { KeyAllocation } from '../../../../models/placement/key-allocation.model.js';
import type { ListPlacement } from '../../../../models/placement/list-placement.model.js';
import type { TrashListLock } from '../../../../models/placement/trash-list-lock.model.js';
import type { LocateRequest } from '../../../../models/task/locate-request.model.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import { TaskCopySourceChanged } from '../../../../models/task/task-copy-source-changed.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { AssigneeChecker } from '../../../../services/member/assignee-checker.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskCopyCreator } from '../../../../services/task/task-copy-creator.service.js';
import { TaskEditGuard } from '../../../../services/task/task-edit-guard.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import { TaskViewBuilder } from '../../../../services/task/task-view-builder.service.js';
import type { DuplicateTaskInput } from './duplicate-task.input.js';
import type { DuplicateTaskOutput } from './duplicate-task.output.js';

const MAX_PREFLIGHT_ATTEMPTS = 3;

interface LockedTaskCopy extends LocatedTask {
  // #region Properties
  /** The available parent after the placement and source locks. */
  readonly parent: SubtaskParent | null;
  readonly assignees: readonly AssigneeCandidate[];
  // #endregion
}

/** Copies one live task, through the tenant transaction of the request. */
export class DuplicateTask {
  // #region Properties
  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;
  private readonly assignees: AssigneeChecker;
  private readonly locator: TaskLocator;
  private readonly editing = new TaskEditGuard();
  private readonly creator = new TaskCopyCreator();
  private readonly views = new TaskViewBuilder();
  // #endregion

  // #region Constructor
  /** Uses the common tenant transaction, placement and membership lookups. */
  public constructor(
    private readonly unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    private readonly spaces: SpaceDirectory,
  ) {
    this.viewers = new ViewerResolver(members);
    this.assignees = new AssigneeChecker(members);
    this.locator = new TaskLocator(spaces);
  }
  // #endregion

  // #region Methods
  /** Creates a standalone copy in its current list. */
  public async execute(input: DuplicateTaskInput): Promise<DuplicateTaskOutput> {
    return this.unitOfWork.run(async (store: TasksStore): Promise<DuplicateTaskOutput> => {
      const { organizationId, actorUserId, taskKey, expectedVersions } = input;
      const viewer: Viewer = await this.viewers.resolve(organizationId, actorUserId, true);
      const request: LocateRequest = {
        organizationId,
        viewer,
        taskKey,
        expectedVersions,
        edit: true,
        archived: 'refuse',
        lock: false,
      };
      const { task: source, placement, parent, assignees } = await this.preflight(store, request);
      const now: Date = await store.clock.now();
      const keys: KeyAllocation = await this.spaces.allocateKeys(
        organizationId,
        placement.space.id,
        1,
      );
      const created: Task = await this.creator.create(store, {
        source,
        placement,
        parent,
        key: TaskKey.of(keys.prefix, keys.firstNumber),
        assignees,
        actor: { type: 'user', id: actorUserId },
        now,
      });
      return this.views.build(store.reader, created);
    });
  }

  private async preflight(store: TasksStore, request: LocateRequest): Promise<LockedTaskCopy> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await store.savepoint(() => this.lockSource(store, request));
      } catch (error: unknown) {
        if (!(error instanceof TaskCopySourceChanged) || attempt >= MAX_PREFLIGHT_ATTEMPTS) {
          throw error;
        }
      }
    }
  }

  private async lockSource(store: TasksStore, request: LocateRequest): Promise<LockedTaskCopy> {
    const { organizationId, viewer } = request;
    const observed: LocatedTask = await this.locator.locate(store, {
      ...request,
      expectedVersions: null,
    });
    const { id, parentId, assigneeIds } = observed.task.snapshot;
    const assignees: readonly AssigneeCandidate[] = await this.assignees.candidates(
      organizationId,
      assigneeIds,
      true,
    );
    const locked: readonly Task[] = await store.tasks.lockByIds(
      organizationId,
      parentId === null ? [id] : [id, parentId],
    );
    const task: Task | undefined = locked.find((row: Task): boolean => row.snapshot.id === id);
    if (task === undefined) {
      throw new TaskRefusal({ reason: 'task-not-found' });
    }
    const { listId, spaceId } = task.snapshot;
    if (task.snapshot.trash !== null) {
      await this.locator.confirm(store, request, observed, task);
    }
    const [held]: readonly TrashListLock[] = await this.spaces.lockTrashLists(
      organizationId,
      [listId],
      'hold',
      viewer,
    );
    if (held?.outcome !== 'live' || held.role === null) {
      throw new TaskRefusal({ reason: 'task-not-found' });
    }
    const placement: ListPlacement | null = await this.spaces.findVisibleList(
      organizationId,
      viewer,
      listId,
    );
    if (placement === null) {
      throw new TaskRefusal({ reason: 'task-not-found' });
    }
    this.editing.requireEdit(placement.list);
    await this.locator.confirm(store, request, observed, task);

    // A new parent or assignee is outside the ordered lock set of this attempt.
    if (
      task.snapshot.parentId !== parentId ||
      task.snapshot.assigneeIds.some((userId: string): boolean => !assigneeIds.includes(userId))
    ) {
      throw new TaskCopySourceChanged();
    }
    const parent: Task | undefined = locked.find((row: Task): boolean => {
      const state = row.snapshot;
      return (
        state.id === parentId &&
        state.archive === null &&
        state.trash === null &&
        state.listId === listId &&
        state.spaceId === spaceId
      );
    });
    return {
      task,
      placement,
      assignees,
      parent:
        parent === undefined
          ? null
          : parent.asParent(
              await store.tasks.levelOf(organizationId, parent.snapshot.id),
              await store.tasks.childCount(organizationId, parent.snapshot.id),
            ),
    };
  }
  // #endregion
}

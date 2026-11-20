import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { InvalidTaskError } from '../../../domain/errors/task/invalid-task.error.js';
import { canWriteTasksOf } from '../../../domain/policies/task/task-write.policy.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { TaskAttachment } from '../../../domain/value-objects/subtask/task-attachment.value-object.js';
import type { SpaceStatusUse } from '../../../domain/value-objects/task/space-status-use.value-object.js';
import { TaskKey } from '../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskPatch } from '../../../domain/value-objects/task/task-patch.value-object.js';
import type { ListPlacement } from '../../models/placement/list-placement.model.js';
import type { PlannedChange } from '../../models/placement/planned-change.model.js';
import type { LocatedTask } from '../../models/task/located-task.model.js';
import type { LockedSubtree } from '../../models/task/locked-subtree.model.js';
import type { TaskChange } from '../../models/task/task-change.model.js';
import { TaskRefusal } from '../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import type { SpaceDirectory } from '../../ports/outbound/spaces/space/space-directory.port.js';
import { TaskEditGuard } from './task-edit-guard.service.js';
import { TaskRuleGuard } from './task-rule-guard.service.js';

/**
 * Class TaskMovePlanner
 *
 * @description
 * Resolves the target of a patch for the domain: the list to move to and the task to attach to
 * are looked up, checked for existence and visibility (`list-invalid`, `parent-invalid`), then for
 * the role a change needs, which the task write policy of the domain decides (`canWriteTasksOf`,
 * applied through `TaskEditGuard`): a move needs `edit` on the list it goes to, an attachment
 * `edit` on the list of the new parent (`role-insufficient`; "It needs `edit` on the list of the
 * task, and on the list it moves to" of `openapi/public/tasks.yaml`); the list of the task itself
 * was checked by `TaskLocator`. An unseen target stays a `422`, a seen one without `edit` is a `403`, both after
 * `If-Match`. An archived parent answers `task-archived` with its key after its `422` and `403`
 * and before the rules of the tree ("Tasks" of `openapi/public/archives.yaml`). The tasks that
 * move with the task (its live descendants, and the new parent) have already been locked by the
 * caller in one ordered tree acquisition, with the live shape checked under those locks
 * (a descendant that left the subtree while the locks were taken is not kept); an archived
 * subtask stays in its list with its parent link. A parent in the trash is unseen
 * (`parent-invalid`), read before the locks or under them. The caller holds the source and target
 * spaces and lists `FOR SHARE` after locking the tasks and rechecks the acting role. No task
 * leaves a deleted list. The planner also picks
 * the statuses the domain checks a new status against: those of the space the task ends up in. The
 * rules of the tree (depth, limit, cycles, the list of a subtask) stay with `Task.update`.
 */
export class TaskMovePlanner {
  // #region Properties
  /** The spaces module, to see the target list and the list of the parent. */
  private readonly spaces: SpaceDirectory;

  /** Checks the role a change needs on the target list and on the list of the new parent. */
  private readonly editing: TaskEditGuard;

  /** Maps the refusal of an archived parent. */
  private readonly rules: TaskRuleGuard;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the directory of the spaces.
   *
   * @param {SpaceDirectory} spaces - The spaces module.
   * @constructor
   */
  public constructor(spaces: SpaceDirectory) {
    this.spaces = spaces;
    this.editing = new TaskEditGuard();
    this.rules = new TaskRuleGuard();
  }
  // #endregion

  // #region Methods
  /**
   * Method plan
   *
   * @description
   * Resolves a patch.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {Viewer} viewer - The acting member.
   * @param {LocatedTask} located - The task, locked, and its place.
   * @param {TaskChange} change - The patch as the request says it.
   * @param {LockedSubtree | null} locked - The tree and parent already locked for a move.
   * @returns {Promise<PlannedChange>} The patch for the domain, the statuses to check and the
   * locked descendants (empty unless the task can change list).
   * @throws {TaskRefusal} `list-invalid`, `parent-invalid`, `role-insufficient` with the role
   * of the actor on the target list or on the list of the new parent, or `task-archived` with the
   * key of an archived parent.
   */
  public async plan(
    store: TasksStore,
    viewer: Viewer,
    located: LocatedTask,
    change: TaskChange,
    locked: LockedSubtree | null,
  ): Promise<PlannedChange> {
    const { task, placement: current } = located;
    const { listId, parentKey, ...fields } = change;
    // Custom values are validated separately against the resolved destination space.
    delete fields.customFieldValues;
    const target: ListPlacement = await this.resolveList(task, current, viewer, listId);
    const moves: boolean = target.list.id !== current.list.id;
    let statuses: SpaceStatusUse = target.space.statuses;
    let descendants: readonly Task[] = [];
    let attachment: TaskAttachment | null | undefined;
    if (parentKey === null) {
      attachment = null;
    }
    if (typeof parentKey === 'string') {
      if (locked === null) throw new Error('An attachment needs its locked subtree.');
      const attached = await this.resolveParent(store, viewer, task, parentKey, locked);
      attachment = attached.attachment;
      statuses = attached.statuses;
      descendants = attached.descendants;
    } else if (moves) {
      if (locked === null) throw new Error('A move needs its locked subtree.');
      descendants = locked.tasks.filter((candidate: Task): boolean =>
        locked.shape.descendantIds.includes(candidate.snapshot.id),
      );
    }
    const patch: TaskPatch = {
      ...fields,
      ...(listId === undefined
        ? {}
        : { list: { listId: target.list.id, spaceId: target.space.id } }),
      ...(attachment === undefined ? {} : { parent: attachment }),
    };
    return { patch, statuses, descendants };
  }

  /**
   * Holds the placement of a status or mention change without a move and rechecks the role.
   *
   * @param organizationId - The task's organization.
   * @param viewer - The verified acting member.
   * @param listId - The task's current list.
   */
  public async holdPlacement(
    organizationId: string,
    viewer: Viewer,
    listId: string,
  ): Promise<void> {
    const [source] = await this.spaces.lockTrashLists(organizationId, [listId], 'hold', viewer);
    if (source?.outcome !== 'live' || source.role === null) {
      throw new TaskRefusal({ reason: 'task-not-found' });
    }
    if (!canWriteTasksOf(source.role)) {
      throw new TaskRefusal({ reason: 'role-insufficient', role: source.role });
    }
  }

  /**
   * Method resolveList
   *
   * @description
   * Finds the list the task moves to, which the actor must see and have `edit` on.
   *
   * @param {Task} task - The task.
   * @param {ListPlacement} current - Where the task is.
   * @param {Viewer} viewer - The acting member.
   * @param {string | undefined} listId - The list of the patch, if it names one.
   * @returns {Promise<ListPlacement>} The target, the current place when the patch names none.
   * @throws {TaskRefusal} `list-invalid` when the list is unknown or not seen,
   * `role-insufficient` when the actor sees it without `edit`.
   */
  private async resolveList(
    task: Task,
    current: ListPlacement,
    viewer: Viewer,
    listId: string | undefined,
  ): Promise<ListPlacement> {
    if (listId === undefined || listId === current.list.id) {
      return current;
    }
    const target: ListPlacement | null = await this.spaces.findVisibleList(
      task.snapshot.organizationId,
      viewer,
      listId,
    );
    if (target === null) {
      throw new TaskRefusal({ reason: 'list-invalid' });
    }
    this.editing.requireEdit(target.list);
    return target;
  }

  /**
   * Method resolveParent
   *
   * @description
   * Finds the already locked parent and reads its level and live subtask count under that lock.
   * The caller locked its current list and checked the actor's role there. An archived parent
   * takes no subtask.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {Viewer} viewer - The acting member.
   * @param {Task} task - The task to attach.
   * @param {string} parentKey - The key of the new parent.
   * @param {LockedSubtree} locked - The tree and parent locked before the list placements.
   * @returns {Promise<{ attachment: TaskAttachment; statuses: SpaceStatusUse; descendants: readonly Task[] }>}
   * The attachment for the domain, the parent space's statuses and the descendants that move.
   * @throws {TaskRefusal} `parent-invalid` when the parent is unknown or not seen,
   * `role-insufficient` when the actor sees its list without `edit`, `task-archived` with the key
   * of the parent when the locked parent is archived.
   */
  private async resolveParent(
    store: TasksStore,
    viewer: Viewer,
    task: Task,
    parentKey: string,
    locked: LockedSubtree,
  ): Promise<{
    readonly attachment: TaskAttachment;
    readonly statuses: SpaceStatusUse;
    readonly descendants: readonly Task[];
  }> {
    const { organizationId } = task.snapshot;
    const invalid: TaskRefusal = new TaskRefusal({ reason: 'parent-invalid', parentKey });
    let key: TaskKey;
    try {
      key = TaskKey.parse(parentKey);
    } catch (error: unknown) {
      throw error instanceof InvalidTaskError ? invalid : error;
    }
    const found: Task | undefined = locked.tasks.find((candidate: Task): boolean =>
      candidate.snapshot.key.equals(key),
    );
    // A parent in the trash is unseen, whoever may restore it.
    const placement: ListPlacement | null =
      found === undefined || found.isInTrash
        ? null
        : await this.spaces.findVisibleList(organizationId, viewer, found.snapshot.listId);
    if (found === undefined || placement === null) {
      throw invalid;
    }
    this.editing.requireEdit(placement.list);
    const parent: Task = found;
    const subtree = locked.shape;
    const statuses: SpaceStatusUse = placement.space.statuses;
    // An archived parent takes no subtask: 409 after its 422 and 403, before the 422 of the tree.
    this.rules.apply((): void => {
      parent.requireChangeable();
    });
    const [level, childCount] = [
      await store.tasks.levelOf(organizationId, parent.snapshot.id),
      await store.tasks.childCount(organizationId, parent.snapshot.id),
    ];
    return {
      attachment: { parent: parent.asParent(level, childCount), subtree },
      statuses,
      descendants: locked.tasks.filter((candidate: Task): boolean =>
        subtree.descendantIds.includes(candidate.snapshot.id),
      ),
    };
  }
  // #endregion
}

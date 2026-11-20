import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { InvalidTaskError } from '../../../domain/errors/task/invalid-task.error.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { TaskAttachment } from '../../../domain/value-objects/subtask/task-attachment.value-object.js';
import type { SpaceStatusUse } from '../../../domain/value-objects/task/space-status-use.value-object.js';
import { TaskKey } from '../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskPatch } from '../../../domain/value-objects/task/task-patch.value-object.js';
import type { HeldList } from '../../models/placement/held-list.model.js';
import type { ListPlacement } from '../../models/placement/list-placement.model.js';
import type { PlannedChange } from '../../models/placement/planned-change.model.js';
import type { LocatedTask } from '../../models/task/located-task.model.js';
import type { TaskChange } from '../../models/task/task-change.model.js';
import { TaskRefusal } from '../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import type { SpaceDirectory } from '../../ports/outbound/spaces/space/space-directory.port.js';
import { TaskEditGuard } from './task-edit-guard.service.js';
import { TaskRuleGuard } from './task-rule-guard.service.js';
import { TaskSubtreeLocker } from './task-subtree-locker.service.js';

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
 * caller in one ordered tree acquisition. `TaskSubtreeLocker` checks the live shape under those locks
 * (a descendant that left the subtree while the locks were taken is not kept); an archived
 * subtask stays in its list with its parent link. A parent in the trash is unseen
 * (`parent-invalid`), read before the locks or under them. A move to another list holds the list
 * it leaves and the one it goes to, in ascending list id, `FOR SHARE` once the tasks are locked
 * (`HoldList`, lock order tasks then lists), and an attachment to a parent in another list holds
 * the list it leaves: a deletion of the list left either committed first (`task-not-found`, as for
 * any task of a deleted list) or waits, so no task leaves a deleted list; a deletion of the target
 * either committed first (`list-invalid`) or waits and its job moves the task too. It also picks
 * the statuses the domain checks a new status against: those of the space the task ends up in. The
 * rules of the tree (depth, limit, cycles, the list of a subtask) stay with `Task.update`.
 */
export class TaskMovePlanner {
  // #region Properties
  /** The spaces module, to see the target list and the list of the parent. */
  private readonly spaces: SpaceDirectory;

  /** Checks the role a change needs on the target list and on the list of the new parent. */
  private readonly editing: TaskEditGuard;

  /** Locks the live descendants that move with the task. */
  private readonly subtrees: TaskSubtreeLocker;

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
    this.subtrees = new TaskSubtreeLocker();
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
  ): Promise<PlannedChange> {
    const { task, placement: current } = located;
    const { listId, parentKey, ...fields } = change;
    const target: ListPlacement = await this.resolveList(task, current, viewer, listId);
    const moves: boolean = target.list.id !== current.list.id;
    let statuses: SpaceStatusUse = target.space.statuses;
    let descendants: readonly Task[] = [];
    let attachment: TaskAttachment | null | undefined;
    if (parentKey === null) {
      attachment = null;
    }
    if (typeof parentKey === 'string') {
      const attached = await this.resolveParent(store, viewer, task, parentKey);
      attachment = attached.attachment;
      statuses = attached.statuses;
      descendants = attached.descendants;
      if (attached.listId !== current.list.id) {
        await this.holdSource(task.snapshot.organizationId, current.list.id);
      }
    } else if (moves) {
      descendants = (await this.subtrees.lock(store, task, [], true)).tasks;
      await this.holdBoth(task.snapshot.organizationId, current.list.id, target.list.id);
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
   * Finds the task to attach to, which the actor must see with `edit` on its list (the task moves
   * to that list), locks it with the live descendants of the task and reads its level and the
   * number of its live subtasks under that lock; a locked parent that is archived takes no
   * subtask. The parent was read without a lock to check its list:
   * when the locked parent is in another list, the visibility, the role and the statuses are those
   * of the list it is in now. A parent in the list of the task needs nothing more: the actor has
   * `edit` on that list already.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {Viewer} viewer - The acting member.
   * @param {Task} task - The task to attach.
   * @param {string} parentKey - The key of the new parent.
   * @returns {Promise<{ attachment: TaskAttachment; statuses: SpaceStatusUse; descendants: readonly Task[]; listId: string }>}
   * The attachment for the domain, the statuses of the space of the parent, the descendants and
   * the list of the locked parent, where the task ends up.
   * @throws {TaskRefusal} `parent-invalid` when the parent is unknown or not seen,
   * `role-insufficient` when the actor sees its list without `edit`, `task-archived` with the key
   * of the parent when the locked parent is archived.
   */
  private async resolveParent(
    store: TasksStore,
    viewer: Viewer,
    task: Task,
    parentKey: string,
  ): Promise<{
    readonly attachment: TaskAttachment;
    readonly statuses: SpaceStatusUse;
    readonly descendants: readonly Task[];
    readonly listId: string;
  }> {
    const { organizationId } = task.snapshot;
    const invalid: TaskRefusal = new TaskRefusal({ reason: 'parent-invalid', parentKey });
    let key: TaskKey;
    try {
      key = TaskKey.parse(parentKey);
    } catch (error: unknown) {
      throw error instanceof InvalidTaskError ? invalid : error;
    }
    const found: Task | null = await store.tasks.findByKey(organizationId, key, false);
    // A parent in the trash is unseen, whoever may restore it.
    const placement: ListPlacement | null =
      found === null || found.isInTrash
        ? null
        : await this.spaces.findVisibleList(organizationId, viewer, found.snapshot.listId);
    if (found === null || placement === null) {
      throw invalid;
    }
    this.editing.requireEdit(placement.list);
    const { tasks: locked, shape: subtree } = await this.subtrees.lock(
      store,
      task,
      [found.snapshot.id],
      true,
    );
    const parent: Task | undefined = locked.find(
      (candidate: Task): boolean => candidate.snapshot.id === found.snapshot.id,
    );
    if (parent === undefined || parent.isInTrash) {
      throw invalid;
    }
    let statuses: SpaceStatusUse = placement.space.statuses;
    if (parent.snapshot.listId !== found.snapshot.listId) {
      const moved: ListPlacement | null = await this.spaces.findVisibleList(
        organizationId,
        viewer,
        parent.snapshot.listId,
      );
      if (moved === null) {
        throw invalid;
      }
      this.editing.requireEdit(moved.list);
      statuses = moved.space.statuses;
    }
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
      descendants: locked.filter((candidate: Task): boolean =>
        subtree.descendantIds.includes(candidate.snapshot.id),
      ),
      listId: parent.snapshot.listId,
    };
  }

  /**
   * Method holdBoth
   *
   * @description
   * Holds the list a task leaves and the one it moves to in ascending list id, the order every
   * writer that locks several lists follows (the grants of a removed member, a deletion of a
   * space), so two moves in opposite directions and a deletion never wait for each other in a
   * cycle. Each hold refuses as its own: the list left `task-not-found`, the target
   * `list-invalid`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} sourceId - The list the task leaves.
   * @param {string} targetId - The list it moves to.
   * @returns {Promise<void>} Resolves once both are held, live.
   * @throws {TaskRefusal} `task-not-found` or `list-invalid`, from the first list held that is
   * deleted or gone.
   */
  private async holdBoth(
    organizationId: string,
    sourceId: string,
    targetId: string,
  ): Promise<void> {
    if (sourceId < targetId) {
      await this.holdSource(organizationId, sourceId);
      await this.holdTarget(organizationId, targetId);
      return;
    }
    await this.holdTarget(organizationId, targetId);
    await this.holdSource(organizationId, sourceId);
  }

  /**
   * Method holdSource
   *
   * @description
   * Holds the list a task leaves `FOR SHARE` until the commit, after the task and its subtree are
   * locked (`HoldList`), for a move to another list and an attachment to a parent in another
   * list: a deletion of that list either committed first, and the change answers `task-not-found`
   * as for any task of a deleted list, or waits for it. So no task leaves a deleted list, and its
   * deletion job cannot miss the archived subtasks a move leaves behind in it.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The list the task leaves.
   * @returns {Promise<void>} Resolves once held, the list live.
   * @throws {TaskRefusal} `task-not-found` when the list is deleted or gone.
   */
  private async holdSource(organizationId: string, listId: string): Promise<void> {
    const held: HeldList = await this.spaces.holdList(organizationId, listId);
    if (held.outcome !== 'live') {
      throw new TaskRefusal({ reason: 'task-not-found' });
    }
  }

  /**
   * Method holdTarget
   *
   * @description
   * Holds the list a task moves to `FOR SHARE` until the commit, after the task and its subtree
   * are locked (`HoldList`): a deletion of that list either committed first, and the move answers
   * `list-invalid` as for an unseen list, or waits for it and its job moves the task to the trash
   * too. An attachment needs no hold: it locks the parent, which the job locks too.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The list the task moves to.
   * @returns {Promise<void>} Resolves once held, the list live.
   * @throws {TaskRefusal} `list-invalid` when the list is deleted or gone.
   */
  private async holdTarget(organizationId: string, listId: string): Promise<void> {
    const held: HeldList = await this.spaces.holdList(organizationId, listId);
    if (held.outcome !== 'live') {
      throw new TaskRefusal({ reason: 'list-invalid' });
    }
  }
  // #endregion
}

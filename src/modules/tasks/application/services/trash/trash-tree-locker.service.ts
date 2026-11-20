import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import type { LockedTrashTrees } from '../../models/trash/locked-trash-trees.model.js';
import type { TrashTreeNode } from '../../models/trash/trash-tree-node.model.js';
import type { TrashTree } from '../../models/trash/trash-tree.model.js';

/**
 * Constant MAX_LOCK_PASSES
 *
 * @description
 * How many times the trees are read and their new tasks locked before giving up: a tree that keeps
 * changing under its locks is a defect (the locks hold every task read before).
 *
 * @type {number}
 */
const MAX_LOCK_PASSES: number = 5;

/**
 * Class TrashTreeLocker
 *
 * @description
 * Locks the trees that roots make in the trash ("a task and its subtasks at every level",
 * `openapi/public/trash.yaml`): each root and every descendant of it in its list out of the trash,
 * live or archived. The trees of all the roots are read in one recursive statement
 * (`TaskRepository.trashTrees`), the roots are taken in their order while the trees they hold stay
 * under `maxTasks` (the first always), their tasks are locked in one statement ordered by id
 * (`FOR NO KEY UPDATE`, without the checklists, which the trash never writes or emits), and the
 * trees are read again under the locks; a task that joined a tree meanwhile is locked in one more
 * statement, until the trees read hold nothing unlocked. A deletion and the deletion job lock each
 * tree with its root in that one statement, so they take common rows in one order on the first
 * pass; a second pass (a tree that changed meanwhile) and a move, which locks its task by key
 * first, do not follow it.
 */
export class TrashTreeLocker {
  // #region Methods
  /**
   * Method lock
   *
   * @description
   * Locks the trees of the roots.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} rootIds - The roots, in the order to take them.
   * @param {readonly Task[]} held - The tasks the caller holds locked already, kept as they are
   * (none for a deletion and the deletion job, which lock the root with its tree).
   * @param {number} maxTasks - The roots are taken until their trees hold this many tasks or more;
   * `Infinity` to take them all.
   * @returns {Promise<LockedTrashTrees>} The roots taken and their trees.
   * @throws {Error} When the trees keep changing under the locks, or a task is in two trees:
   * defects.
   */
  public async lock(
    store: TasksStore,
    organizationId: string,
    rootIds: readonly string[],
    held: readonly Task[],
    maxTasks: number,
  ): Promise<LockedTrashTrees> {
    const locked = new Map<string, Task>(
      held.map((task: Task): [string, Task] => [task.snapshot.id, task]),
    );
    const read: readonly TrashTreeNode[] = await store.tasks.trashTrees(organizationId, rootIds);
    const examined: readonly string[] = this.take(rootIds, read, maxTasks);
    let nodes: readonly TrashTreeNode[] = read.filter((node: TrashTreeNode): boolean =>
      examined.includes(node.rootId),
    );
    for (let pass = 0; pass < MAX_LOCK_PASSES; pass += 1) {
      const unlocked: readonly string[] = [
        ...new Set(nodes.map((node: TrashTreeNode): string => node.id)),
      ].filter((id: string): boolean => !locked.has(id));
      if (unlocked.length === 0) {
        return { examined, trees: this.treesOf(examined, nodes, locked) };
      }
      for (const task of await store.tasks.lockByIds(organizationId, unlocked, false)) {
        locked.set(task.snapshot.id, task);
      }
      nodes = await store.tasks.trashTrees(organizationId, examined);
    }
    throw new Error(
      `The trees of the trash entries of ${examined.join(', ')} kept changing while they were locked.`,
    );
  }

  /**
   * Method take
   *
   * @description
   * The roots taken: in their order, the first always, then each next one while the trees taken
   * hold fewer than `maxTasks` tasks.
   *
   * @param {readonly string[]} rootIds - The roots.
   * @param {readonly TrashTreeNode[]} nodes - Their trees, as read.
   * @param {number} maxTasks - The bound.
   * @returns {readonly string[]} The roots taken.
   */
  private take(
    rootIds: readonly string[],
    nodes: readonly TrashTreeNode[],
    maxTasks: number,
  ): readonly string[] {
    const sizes = new Map<string, number>();
    for (const node of nodes) {
      sizes.set(node.rootId, (sizes.get(node.rootId) ?? 0) + 1);
    }
    const taken: string[] = [];
    let held: number = 0;
    for (const rootId of rootIds) {
      if (held >= maxTasks) {
        break;
      }
      taken.push(rootId);
      held += sizes.get(rootId) ?? 0;
    }
    return taken;
  }

  /**
   * Method treesOf
   *
   * @description
   * The trees read under the locks, each with its root and its tasks as locked; a root gone or in
   * the trash meanwhile makes none.
   *
   * @param {readonly string[]} rootIds - The roots taken.
   * @param {readonly TrashTreeNode[]} nodes - Their trees, read under the locks.
   * @param {ReadonlyMap<string, Task>} locked - The tasks locked, by id.
   * @returns {readonly TrashTree[]} The trees, in the order of the roots.
   * @throws {Error} When a task of a tree is not locked, or a task is in two trees.
   */
  private treesOf(
    rootIds: readonly string[],
    nodes: readonly TrashTreeNode[],
    locked: ReadonlyMap<string, Task>,
  ): readonly TrashTree[] {
    const seen = new Set<string>();
    return rootIds.flatMap((rootId: string): TrashTree[] => {
      const members: Task[] = nodes
        .filter((node: TrashTreeNode): boolean => node.rootId === rootId)
        .map((node: TrashTreeNode): Task => {
          const task: Task | undefined = locked.get(node.id);
          if (task === undefined || seen.has(node.id)) {
            throw new Error(`The task ${node.id} of the tree of ${rootId} is not locked once.`);
          }
          seen.add(node.id);
          return task;
        });
      const root: Task | undefined = locked.get(rootId);
      return members.length === 0 || root === undefined ? [] : [{ root, members }];
    });
  }
  // #endregion
}

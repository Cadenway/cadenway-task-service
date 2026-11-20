import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { BulkTaskExpansionError } from '../../models/bulk/bulk-task-expansion.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import type { TrashTree } from '../../models/trash/trash-tree.model.js';

/** Discovers and collapses overlapping expanded selections without changing any task. */
export class BulkTaskTrees {
  // #region Methods
  /** Reads each selected tree using the traversal rules of the corresponding single action. */
  public async discover(
    store: TasksStore,
    organizationId: string,
    selected: readonly Task[],
    trash: boolean,
    destinationId: string | null,
  ): Promise<ReadonlyMap<string, string[]>> {
    const trees = new Map<string, string[]>();
    if (trash) {
      const ids = new Set(selected.map(({ snapshot }): string => snapshot.id));
      for (const {
        snapshot: { id },
      } of selected) {
        const nodes = await store.tasks.trashTrees(
          organizationId,
          [id],
          BulkTaskExpansionError.maxAffected + 1,
        );
        const members = nodes
          .filter(({ depth }): boolean => depth > 0)
          .map((node): string => node.id);
        this.add(ids, members);
        trees.set(id, members);
      }
    } else if (destinationId !== null) {
      for (const { snapshot: task } of selected) {
        if (task.listId === destinationId) continue;
        const { descendantIds } = await store.tasks.subtreeOf(organizationId, task.id);
        trees.set(task.id, [...descendantIds]);
      }
    }
    return trees;
  }

  /** Counts a shared descendant once and refuses before any write at the expanded ceiling. */
  public ids(trees: ReadonlyMap<string, readonly string[]>): ReadonlySet<string> {
    const ids = new Set(trees.keys());
    for (const members of trees.values()) {
      this.add(ids, members);
    }
    return ids;
  }

  /** Counts each affected row once, regardless of how many selected roots cover it. */
  private add(ids: Set<string>, members: readonly string[]): void {
    for (const id of members) ids.add(id);
    if (ids.size > BulkTaskExpansionError.maxAffected) throw new BulkTaskExpansionError();
  }

  /** Materializes each disjoint root and its locked members, root first. */
  public roots(
    trees: ReadonlyMap<string, readonly string[]>,
    locked: ReadonlyMap<string, Task>,
  ): readonly TrashTree[] {
    const descendants = new Set([...trees.values()].flat());
    return [...trees].flatMap(([rootId, memberIds]): readonly TrashTree[] => {
      if (descendants.has(rootId)) return [];
      const [root, ...members] = [rootId, ...memberIds].map((id): Task => {
        const task = locked.get(id);
        if (task === undefined) throw new Error('An expanded bulk task was not held.');
        return task;
      });
      if (root === undefined) throw new Error('An expanded bulk tree has no root.');
      return [{ root, members: [root, ...members] }];
    });
  }
  // #endregion
}

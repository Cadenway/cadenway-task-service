import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import type { SubtreeShape } from '../../../domain/value-objects/subtask/subtree-shape.value-object.js';
import type { LockedSubtree } from '../../models/task/locked-subtree.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';

/**
 * How many times the subtree is read to lock it: the three levels the read goes down, plus the
 * read that finds nothing new. A subtree that keeps growing while it is locked is a defect.
 */
const MAX_LOCK_PASSES: number = 5;

/**
 * The most descendants a valid task can have: 25 subtasks, each with 25 subtasks of its own (three
 * levels at most). More means the stored tree breaks the limits, and locking it would be unbounded.
 */
const MAX_DESCENDANTS: number = 650;

/**
 * Class TaskSubtreeLocker
 *
 * @description
 * Locks the live descendants of a task the caller holds locked, for the writes that carry a
 * subtree: a move, an attachment ("a task that moves takes its subtasks with it",
 * `openapi/public/tasks.yaml`) and an archive ("Archiving a task archives its subtree", "Tasks" of
 * `openapi/public/archives.yaml`). The subtree is the live one (`TaskRepository.subtreeOf`): an
 * archived subtask keeps its own archive, never moves and is not taken. The descendants, and the
 * other tasks asked for, are locked `FOR NO KEY UPDATE` in statements in ascending id order, until
 * the subtree read after the locks holds nothing that is not locked; at most 651 tasks (the task,
 * 25 subtasks, 625 sub-subtasks) and 5 passes. A move needs the checklists of the tasks it
 * carries; an archive does not (it never writes or emits them), so it locks them without.
 */
export class TaskSubtreeLocker {
  // #region Methods
  /**
   * Method lock
   *
   * @description
   * Locks the live descendants of a task, and some other tasks, in statements in id order, until
   * the subtree read after the locks holds nothing that is not locked. A task locked on the
   * strength of an earlier read may have left the subtree meanwhile (another transaction moved,
   * re-parented or archived it before the lock was granted); the last read decides, so only the
   * tasks that are still live descendants, and the other tasks asked for, are returned. Writers
   * lock a task before they change its parent, its subtasks or its archive, so the subtree cannot
   * change once every task of it is locked. A valid subtree has three levels and at most 650
   * descendants, which bounds the passes and the locks.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {Task} task - The task, locked by the caller.
   * @param {readonly string[]} otherIds - The other tasks to lock with them.
   * @param {boolean} [withChecklists] - `false` to lock the tasks without loading their checklists
   * (they carry an empty one), for a write that never reads, writes or emits them; `true` by
   * default.
   * @returns {Promise<LockedSubtree>} The locked descendants and other tasks, and the subtree they
   * were checked against.
   * @throws {Error} When the stored subtree is larger than a valid one, or keeps growing while it
   * is locked.
   */
  public async lock(
    store: TasksStore,
    task: Task,
    otherIds: readonly string[],
    withChecklists: boolean = true,
  ): Promise<LockedSubtree> {
    const { organizationId, id } = task.snapshot;
    const asked = new Set<string>();
    const held = new Map<string, Task>();
    for (let pass = 0; pass < MAX_LOCK_PASSES; pass += 1) {
      const shape: SubtreeShape = await store.tasks.subtreeOf(organizationId, id);
      if (shape.descendantIds.length > MAX_DESCENDANTS) {
        throw new Error(
          `The task ${id} has ${String(shape.descendantIds.length)} descendants, more than ${String(MAX_DESCENDANTS)}.`,
        );
      }
      const wanted: ReadonlySet<string> = new Set<string>([...otherIds, ...shape.descendantIds]);
      const unlocked: readonly string[] = [...wanted].filter(
        (wantedId: string): boolean => !asked.has(wantedId),
      );
      if (unlocked.length === 0) {
        return {
          tasks: [...held.values()].filter((candidate: Task): boolean =>
            wanted.has(candidate.snapshot.id),
          ),
          shape,
        };
      }
      for (const wantedId of unlocked) {
        asked.add(wantedId);
      }
      for (const locked of await store.tasks.lockByIds(organizationId, unlocked, withChecklists)) {
        held.set(locked.snapshot.id, locked);
      }
    }
    throw new Error(`The subtree of the task ${id} kept changing while it was locked.`);
  }
  // #endregion
}

import { InvalidTaskError } from '../../../domain/errors/task/invalid-task.error.js';
import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { purgeAtOf } from '../../../domain/policies/trash/trash-retention.policy.js';
import { TaskKey } from '../../../domain/value-objects/task/task-key.value-object.js';
import type { ListPlacement } from '../../models/placement/list-placement.model.js';
import type { LocateRequest } from '../../models/task/locate-request.model.js';
import type { LocatedTask } from '../../models/task/located-task.model.js';
import { TaskRefusal } from '../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import type { TrashEntryRecord } from '../../models/trash/trash-entry-record.model.js';
import type { SpaceDirectory } from '../../ports/outbound/spaces/space/space-directory.port.js';
import { TrashEntryLocator } from '../trash/trash-entry-locator.service.js';
import { TaskEditGuard } from './task-edit-guard.service.js';
import { TaskRuleGuard } from './task-rule-guard.service.js';

/**
 * Class TaskLocator
 *
 * @description
 * Finds a task by its key for an actor, in the order the writes of the module follow: the task,
 * the trash, its visibility through the list it is in, the role a change needs on that list, the
 * archive, then the `If-Match` check (`404` → `403` → `409` → `412`). A task that does not exist,
 * and a task of a list the actor has no role on (a guest has a role on the lists shared with them
 * only, and a deleted list is seen by nobody), get the same answer, `task-not-found`. A task in the
 * trash answers `task-trashed` with its entry when the actor may restore that entry (`edit` on its
 * list as if the list and its space were not deleted, the entry not handed to the purge by "Vider
 * la corbeille"), and `task-not-found` otherwise (`TaskNotFound` of `openapi/public/tasks.yaml`:
 * "every route of its key answers `404 task.trashed`"), for a read and a write alike, before the
 * role a change needs. A change (`edit`) of a task the actor sees without `edit` on
 * its list answers `role-insufficient`, before `If-Match`. A change of an archived task
 * (`archived: 'refuse'`) answers `task-archived` with its key ("Tasks" of
 * `openapi/public/archives.yaml`: an archived task "refuses every change with `409
 * task.archived`"), decided by the domain (`Task.requireChangeable`) on the state the write applies
 * to, the locked one. A read, the archive and the restoration ask `allow`. The organization of the
 * request scopes every read.
 *
 * A write (`lock`) does not lock before it knows the actor may see, and change, the task: it reads
 * the task without a lock and checks its list, then locks the task and reads it again. An edit
 * holds the current space and list after the task lock and reads visibility again before checking
 * the archive or version. If the task moved meanwhile, the held placement is its new one.
 * A task deleted in between answers as in the trash.
 */
export class TaskLocator {
  // #region Properties
  /** The spaces module, to see the list of a task. */
  private readonly spaces: SpaceDirectory;

  /** Checks the role a change needs. */
  private readonly editing: TaskEditGuard;

  /** Maps the refusal of an archived task. */
  private readonly rules: TaskRuleGuard;

  /** Finds the entry of a task in the trash, when the actor may restore it. */
  private readonly entries: TrashEntryLocator;
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
    this.entries = new TrashEntryLocator(spaces);
  }
  // #endregion

  // #region Methods
  /**
   * Method locate
   *
   * @description
   * Finds the task and its place.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {LocateRequest} request - The organization, the viewer, the key, whether the task
   * changes, the lock, whether an archived task is refused and `If-Match`.
   * @returns {Promise<LocatedTask>} The task and its list and space.
   * @throws {TaskRefusal} `task-not-found`, `task-trashed` with its entry, `role-insufficient`
   * with the role of the actor on the list, `task-archived` with the key of the task, or
   * `version-mismatch` with the stored version.
   */
  public async locate(store: TasksStore, request: LocateRequest): Promise<LocatedTask> {
    const key: TaskKey = this.parse(request.taskKey);
    let task: Task = await this.find(store, request, key, false);
    await this.refuseTrashed(store, request, task);
    let placement: ListPlacement = await this.see(request, task);
    if (request.lock) {
      const read: string = task.snapshot.listId;
      task = await this.find(store, request, key, true);
      await this.refuseTrashed(store, request, task);
      if (task.snapshot.listId !== read) {
        placement = await this.see(request, task);
      }
      if (request.edit) {
        const [held] = await this.spaces.lockTrashLists(
          request.organizationId,
          [task.snapshot.listId],
          'hold',
          request.viewer,
        );
        if (held?.outcome !== 'live' || held.role === null) {
          throw new TaskRefusal({ reason: 'task-not-found' });
        }
        placement = await this.see(request, task);
      }
    }
    if (request.archived === 'refuse') {
      const located: Task = task;
      this.rules.apply((): void => {
        located.requireChangeable();
      });
    }
    this.requireVersion(task, request.expectedVersions);
    return { task, placement };
  }

  /**
   * Method confirm
   *
   * @description
   * Checks again, on the task as a lock taken after `locate` (without its lock) read it, what
   * `locate` checked on the unlocked read: in the trash meanwhile, its current list (its
   * visibility and `edit` again), archived meanwhile when refused, then `If-Match` on the
   * locked version. For a writer that locks the task with others in one ordered statement instead
   * of by key first, so that its lock order is the one of the other writers of the same rows.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {LocateRequest} request - The request `locate` answered, with `lock` false.
   * @param {Task} locked - The same task, as read under its lock.
   * @returns {Promise<LocatedTask>} The locked task and its list and space.
   * @throws {TaskRefusal} `task-not-found`, `task-trashed` with its entry, `role-insufficient`,
   * `task-archived` or `version-mismatch`, as `locate`.
   */
  public async confirm(
    store: TasksStore,
    request: LocateRequest,
    locked: Task,
  ): Promise<LocatedTask> {
    await this.refuseTrashed(store, request, locked);
    const placement: ListPlacement = await this.see(request, locked);
    if (request.archived === 'refuse') {
      this.rules.apply((): void => {
        locked.requireChangeable();
      });
    }
    this.requireVersion(locked, request.expectedVersions);
    return { task: locked, placement };
  }

  /**
   * Method requireVersion
   *
   * @description
   * The `If-Match` check of a task (`412 request.version-mismatch`): the one check of every write,
   * which `locate` runs last and the restoration runs on the task of its path once it holds the
   * lock of its archive. `*` and an absent header are `null` (`toExpectedVersions`).
   *
   * @param {Task} task - The task, as the write applies to it.
   * @param {readonly number[] | null} expectedVersions - The versions `If-Match` accepts, `null`
   * for any.
   * @throws {TaskRefusal} `version-mismatch` with the stored version.
   */
  public requireVersion(task: Task, expectedVersions: readonly number[] | null): void {
    const { version } = task.snapshot;
    if (expectedVersions !== null && !expectedVersions.includes(version)) {
      throw new TaskRefusal({ reason: 'version-mismatch', version });
    }
  }

  /**
   * Method find
   *
   * @description
   * Reads the task of the request by its key, locking it when asked.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {LocateRequest} request - The organization of the request.
   * @param {TaskKey} key - The key.
   * @param {boolean} lock - `true` to lock the task `FOR NO KEY UPDATE`.
   * @returns {Promise<Task>} The task.
   * @throws {TaskRefusal} `task-not-found` when the organization holds no such task.
   */
  private async find(
    store: TasksStore,
    request: LocateRequest,
    key: TaskKey,
    lock: boolean,
  ): Promise<Task> {
    const task: Task | null = await store.tasks.findByKey(request.organizationId, key, lock);
    if (task === null) {
      throw new TaskRefusal({ reason: 'task-not-found' });
    }
    return task;
  }

  /**
   * Method see
   *
   * @description
   * Finds the list of a task through the spaces module, for the viewer, and checks the role a
   * change needs on it.
   *
   * @param {LocateRequest} request - The organization, the viewer and whether the task changes.
   * @param {Task} task - The task.
   * @returns {Promise<ListPlacement>} The list and its space.
   * @throws {TaskRefusal} `task-not-found` when the viewer has no role on the list,
   * `role-insufficient` when the task changes and the role is not `edit`.
   */
  private async see(request: LocateRequest, task: Task): Promise<ListPlacement> {
    const placement: ListPlacement | null = await this.spaces.findVisibleList(
      request.organizationId,
      request.viewer,
      task.snapshot.listId,
    );
    if (placement === null) {
      throw new TaskRefusal({ reason: 'task-not-found' });
    }
    if (request.edit) {
      this.editing.requireEdit(placement.list);
    }
    return placement;
  }

  /**
   * Method refuseTrashed
   *
   * @description
   * Refuses a task in the trash: `task-trashed` with its key and name, its entry, the key of the
   * root of the entry, when and by whom it was deleted and when it is erased, when the actor may
   * restore the entry; `task-not-found` otherwise. A task that is not in the trash passes.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {LocateRequest} request - The organization and the viewer.
   * @param {Task} task - The task, as read.
   * @returns {Promise<void>} Resolves when the task is not in the trash.
   * @throws {TaskRefusal} `task-trashed` or `task-not-found`.
   */
  private async refuseTrashed(
    store: TasksStore,
    request: LocateRequest,
    task: Task,
  ): Promise<void> {
    const { trash, key, name } = task.snapshot;
    if (trash === null) {
      return;
    }
    const entry: TrashEntryRecord | null = await this.entries.findRestorable(
      store,
      request.organizationId,
      request.viewer,
      trash.entryId,
    );
    if (entry === null) {
      throw new TaskRefusal({ reason: 'task-not-found' });
    }
    throw new TaskRefusal({
      reason: 'task-trashed',
      key: key.format(),
      name,
      entryId: entry.id,
      rootKey: entry.root.key,
      trashedAt: entry.trashedAt,
      trashedBy: entry.trashedBy,
      purgeAt: purgeAtOf(entry.trashedAt),
    });
  }

  /**
   * Method parse

   *
   * @description
   * Parses a key; a text that is not a key names no task.
   *
   * @param {string} text - The key.
   * @returns {TaskKey} The key.
   * @throws {TaskRefusal} `task-not-found` when the text is not a key.
   */
  private parse(text: string): TaskKey {
    try {
      return TaskKey.parse(text);
    } catch (error: unknown) {
      if (error instanceof InvalidTaskError) {
        throw new TaskRefusal({ reason: 'task-not-found' });
      }
      throw error;
    }
  }
  // #endregion
}

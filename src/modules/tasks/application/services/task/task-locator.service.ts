import { InvalidTaskError } from '../../../domain/errors/task/invalid-task.error.js';
import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { TaskKey } from '../../../domain/value-objects/task/task-key.value-object.js';
import type { ListPlacement } from '../../models/placement/list-placement.model.js';
import type { LocateRequest } from '../../models/task/locate-request.model.js';
import type { LocatedTask } from '../../models/task/located-task.model.js';
import { TaskRefusal } from '../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import type { SpaceDirectory } from '../../ports/outbound/spaces/space/space-directory.port.js';

/**
 * Class TaskLocator
 *
 * @description
 * Finds a task by its key for an actor, in the order the writes of the module follow: the task,
 * its visibility through the list it is in, then the `If-Match` check. A task that does not exist,
 * and a task in a space the actor does not see (a guest sees none), get the same answer,
 * `task-not-found`. The organization of the request scopes every read.
 *
 * A write (`lock`) does not lock before it knows the actor may see the task: it reads the task
 * without a lock and checks the visibility of its list, then locks the task and reads it again.
 * If another transaction moved the task to another list in between, the visibility is checked
 * again on the list the locked task is in, so what the actor is allowed to change is decided on
 * the state the write applies to. A refusal is the same `task-not-found` as without the lock.
 */
export class TaskLocator {
  // #region Properties
  /** The spaces module, to see the list of a task. */
  private readonly spaces: SpaceDirectory;
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
   * @param {LocateRequest} request - The organization, the viewer, the key, the lock and `If-Match`.
   * @returns {Promise<LocatedTask>} The task and its list and space.
   * @throws {TaskRefusal} `task-not-found`, or `version-mismatch` with the stored version.
   */
  public async locate(store: TasksStore, request: LocateRequest): Promise<LocatedTask> {
    const key: TaskKey = this.parse(request.taskKey);
    let task: Task = await this.find(store, request, key, false);
    let placement: ListPlacement = await this.see(request, task);
    if (request.lock) {
      const read: string = task.snapshot.listId;
      task = await this.find(store, request, key, true);
      if (task.snapshot.listId !== read) {
        placement = await this.see(request, task);
      }
    }
    const { version } = task.snapshot;
    if (request.expectedVersions !== null && !request.expectedVersions.includes(version)) {
      throw new TaskRefusal({ reason: 'version-mismatch', version });
    }
    return { task, placement };
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
   * Finds the list of a task through the spaces module, for the viewer.
   *
   * @param {LocateRequest} request - The organization and the viewer.
   * @param {Task} task - The task.
   * @returns {Promise<ListPlacement>} The list and its space.
   * @throws {TaskRefusal} `task-not-found` when the viewer does not see the list.
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
    return placement;
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

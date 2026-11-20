import { InvalidTaskError } from '../../../../../domain/errors/task/invalid-task.error.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { ListPlacement } from '../../../../models/placement/list-placement.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { TaskLocation } from '../../../../projections/task/task-location.projection.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import type { CheckTaskAccessInput } from './check-task-access.input.js';
import type { CheckTaskAccessOutput } from './check-task-access.output.js';

/**
 * Class CheckTaskAccess
 *
 * @description
 * Checks whether the person of a socket of the realtime gateway sees a task, and with which role:
 * the role of its list (`GET /internal/v1/tasks/{taskKey}/access`), before the socket joins the
 * room of the task. A key that is not a key, an unknown task and a task of a list the actor has no
 * role on all answer `task-not-found`, as every route of a task does; any role is enough. It runs
 * in one read-only tenant transaction, scoped to the organization of the context, without a lock:
 * the copy of the memberships, one read of the task by `tasks_key_unique` without its collections,
 * then `FindVisibleList` of the spaces module for its list. Nothing is written and nothing is
 * emitted.
 */
export class CheckTaskAccess {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** The spaces module. */
  private readonly spaces: SpaceDirectory;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port and the two directories.
   *
   * @param {TasksUnitOfWork} unitOfWork - The tenant transaction.
   * @param {MemberDirectory} members - The copy of the memberships.
   * @param {SpaceDirectory} spaces - The spaces module.
   * @constructor
   */
  public constructor(
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ) {
    this.unitOfWork = unitOfWork;
    this.spaces = spaces;
    this.viewers = new ViewerResolver(members);
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads the role of the actor on the list of the task.
   *
   * @param {CheckTaskAccessInput} input - The actor and the key.
   * @returns {Promise<CheckTaskAccessOutput>} The role and where the task is.
   * @throws {TaskRefusal} `organization-not-found` or `task-not-found`.
   */
  public async execute(input: CheckTaskAccessInput): Promise<CheckTaskAccessOutput> {
    const work = async (store: TasksStore): Promise<CheckTaskAccessOutput> => {
      const viewer: Viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
      const location: TaskLocation | null = await store.reader.locationByKey(
        input.organizationId,
        this.parse(input.taskKey),
      );
      const placement: ListPlacement | null =
        location === null
          ? null
          : await this.spaces.findVisibleList(input.organizationId, viewer, location.listId);
      if (location === null || placement === null) {
        throw new TaskRefusal({ reason: 'task-not-found' });
      }
      return {
        role: placement.list.callerRole,
        spaceId: placement.list.spaceId,
        listId: placement.list.id,
        taskId: location.id,
        taskKey: location.key,
      };
    };
    return input.joinWrite === true
      ? this.unitOfWork.run(work)
      : this.unitOfWork.runReadOnly(work, { snapshot: true });
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

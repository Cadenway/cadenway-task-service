import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import { TaskViewBuilder } from '../../../../services/task/task-view-builder.service.js';
import type { GetTaskInput } from './get-task.input.js';
import type { GetTaskOutput } from './get-task.output.js';

/**
 * Class GetTask
 *
 * @description
 * Reads one task by its key (`GET /internal/v1/tasks/{taskKey}`), without a lock. A task is seen
 * by whoever has a role on its list, any role: an unknown task and a task of a list the actor has
 * no role on get the same answer, `task-not-found`. It runs in one read-only
 * tenant transaction, scoped to the organization of the context.
 */
export class GetTask {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Finds the task. */
  private readonly locator: TaskLocator;

  /** Builds the view of the task. */
  private readonly views: TaskViewBuilder;
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
    this.viewers = new ViewerResolver(members);
    this.locator = new TaskLocator(spaces);
    this.views = new TaskViewBuilder();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads the task.
   *
   * @param {GetTaskInput} input - The actor and the key.
   * @returns {Promise<GetTaskOutput>} The task.
   * @throws {TaskRefusal} `organization-not-found` or `task-not-found`.
   */
  public async execute(input: GetTaskInput): Promise<GetTaskOutput> {
    return this.unitOfWork.runReadOnly(async (store: TasksStore): Promise<GetTaskOutput> => {
      const viewer: Viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
      const { task }: LocatedTask = await this.locator.locate(store, {
        organizationId: input.organizationId,
        viewer,
        taskKey: input.taskKey,
        edit: false,
        lock: false,
        archived: 'allow',
        expectedVersions: null,
      });
      return this.views.build(store.reader, task);
    });
  }
  // #endregion
}

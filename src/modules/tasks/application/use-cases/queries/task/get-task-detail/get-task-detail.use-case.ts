import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { MAX_DIRECT_SUBTASKS } from '../../../../../domain/value-objects/task/task-limits.value-object.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { TaskReferenceView } from '../../../../projections/task/task-reference.projection.js';
import type { TaskSummaryView } from '../../../../projections/task/task-summary.projection.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import { TaskViewBuilder } from '../../../../services/task/task-view-builder.service.js';
import type { GetTaskDetailInput } from './get-task-detail.input.js';
import type { GetTaskDetailOutput } from './get-task-detail.output.js';

/**
 * Class GetTaskDetail
 *
 * @description
 * Reads the detail of a task (`GET /internal/v1/tasks/{taskKey}/detail`) in one transaction, so
 * that the task, its space, its list, its parent and its subtasks agree, without a lock. The
 * parent is read as a reference, with its name and status as they are now; the subtasks are the
 * direct ones, in the order of their creation (at most 25). Visibility is that of `GetTask`.
 */
export class GetTaskDetail {
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
   * Reads the detail.
   *
   * @param {GetTaskDetailInput} input - The actor and the key.
   * @returns {Promise<GetTaskDetailOutput>} The detail.
   * @throws {TaskRefusal} `organization-not-found` or `task-not-found`.
   */
  public async execute(input: GetTaskDetailInput): Promise<GetTaskDetailOutput> {
    return this.unitOfWork.run(async (store: TasksStore): Promise<GetTaskDetailOutput> => {
      const viewer: Viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
      const { task, placement }: LocatedTask = await this.locator.locate(store, {
        organizationId: input.organizationId,
        viewer,
        taskKey: input.taskKey,
        lock: false,
        expectedVersions: null,
      });
      const { id, parentId } = task.snapshot;
      const references: ReadonlyMap<string, TaskReferenceView> =
        parentId === null
          ? new Map()
          : await store.reader.references(input.organizationId, [parentId]);
      const subtasks: readonly TaskSummaryView[] = await store.reader.childrenOf(
        input.organizationId,
        id,
        null,
        MAX_DIRECT_SUBTASKS,
      );
      return {
        task: await this.views.build(store.reader, task),
        space: placement.space,
        list: placement.list,
        parent: parentId === null ? null : (references.get(parentId) ?? null),
        subtasks,
      };
    });
  }
  // #endregion
}

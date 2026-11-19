import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { Slice } from '../../../../models/page/slice.model.js';
import type { ListedTask } from '../../../../models/query/listed-task.model.js';
import type { TaskPosition } from '../../../../models/query/task-position.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { MyTaskCountsView } from '../../../../projections/user/my-task-counts.projection.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { PageSlicer } from '../../../../services/page/page-slicer.service.js';
import type { ListMyTasksInput } from './list-my-tasks.input.js';
import type { ListMyTasksOutput } from './list-my-tasks.output.js';

/**
 * Class ListMyTasks
 *
 * @description
 * Lists the tasks assigned to the actor in every list they have a role on, subtasks included, by
 * due date (the tasks without one last) then in the order of their creation, one keyset page at a
 * time (`GET /internal/v1/users/{userId}/tasks`), without a lock. The tab `open` holds the tasks
 * that are not closed, the tab `closed` those of the keys `done` and `cancelled`; `counts` covers
 * both tabs on every page. A `userId` other than the actor answers `user-not-found`, checked before
 * the membership copy is read (open question 11 of the design). The lists come from the spaces
 * module (a guest has a role on the lists shared with them only); an actor with a role on no list
 * gets an empty page with zero counts, without a read of the tasks.
 */
export class ListMyTasks {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** The spaces module. */
  private readonly spaces: SpaceDirectory;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Cuts the page. */
  private readonly pages: PageSlicer;
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
    this.pages = new PageSlicer();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads the page and the counts.
   *
   * @param {ListMyTasksInput} input - The actor, the `userId` of the path, the tab and the page.
   * @returns {Promise<ListMyTasksOutput>} The tasks, where the next page starts and the counts of
   * both tabs.
   * @throws {TaskRefusal} `user-not-found` or `organization-not-found`.
   */
  public async execute(input: ListMyTasksInput): Promise<ListMyTasksOutput> {
    if (input.userId.toLowerCase() !== input.actorUserId.toLowerCase()) {
      throw new TaskRefusal({ reason: 'user-not-found' });
    }
    return this.unitOfWork.runReadOnly(async (store: TasksStore): Promise<ListMyTasksOutput> => {
      const viewer: Viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
      const listIds: readonly string[] = await this.spaces.visibleListIds(
        input.organizationId,
        viewer,
      );
      if (listIds.length === 0) {
        return { items: [], next: null, counts: { open: 0, closed: 0 } };
      }
      const rows: readonly ListedTask[] = await store.assigned.pageAssignedTo(
        input.organizationId,
        viewer.userId,
        listIds,
        input.state,
        input.after,
        input.limit + 1,
      );
      const page: Slice<ListedTask, TaskPosition> = this.pages.slice(
        rows,
        input.limit,
        (row: ListedTask): TaskPosition => row.position,
      );
      const counts: MyTaskCountsView = await store.counter.stateCountsOf(
        input.organizationId,
        viewer.userId,
        listIds,
      );
      return { items: page.items.map((row: ListedTask) => row.task), next: page.next, counts };
    });
  }
  // #endregion
}

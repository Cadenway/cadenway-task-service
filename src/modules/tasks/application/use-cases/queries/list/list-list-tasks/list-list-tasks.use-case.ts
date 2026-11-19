import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { Slice } from '../../../../models/page/slice.model.js';
import type { ListPlacement } from '../../../../models/placement/list-placement.model.js';
import type { ListedTask } from '../../../../models/query/listed-task.model.js';
import type { TaskFilter } from '../../../../models/query/task-filter.model.js';
import type { TaskPosition } from '../../../../models/query/task-position.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { PageSlicer } from '../../../../services/page/page-slicer.service.js';
import { TaskFilterBuilder } from '../../../../services/query/task-filter-builder.service.js';
import type { ListListTasksInput } from './list-list-tasks.input.js';
import type { ListListTasksOutput } from './list-list-tasks.output.js';

/**
 * Class ListListTasks
 *
 * @description
 * Lists the tasks of a list, filtered and sorted, one keyset page at a time
 * (`GET /internal/v1/lists/{listId}/tasks`), without a lock. An unknown list and a list the actor
 * has no role on get the same answer, `list-not-found`; after that, filtering on the list is
 * enough, as a task is seen through its list. It reads one row more
 * than the page to know whether another follows, and counts the tasks that match the filters in the
 * same read-only transaction, so `total` is the same on every page.
 */
export class ListListTasks {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** The spaces module. */
  private readonly spaces: SpaceDirectory;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Resolves the filters of the route. */
  private readonly filters: TaskFilterBuilder;

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
    this.filters = new TaskFilterBuilder();
    this.pages = new PageSlicer();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads the page.
   *
   * @param {ListListTasksInput} input - The actor, the list, the filters, the order and the page.
   * @returns {Promise<ListListTasksOutput>} The tasks, where the next page starts and the total.
   * @throws {TaskRefusal} `organization-not-found` or `list-not-found`.
   */
  public async execute(input: ListListTasksInput): Promise<ListListTasksOutput> {
    return this.unitOfWork.runReadOnly(async (store: TasksStore): Promise<ListListTasksOutput> => {
      const viewer: Viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
      const placement: ListPlacement | null = await this.spaces.findVisibleList(
        input.organizationId,
        viewer,
        input.listId,
      );
      if (placement === null) {
        throw new TaskRefusal({ reason: 'list-not-found' });
      }
      const filter: TaskFilter = this.filters.build(input.filter, input.actorUserId);
      const rows: readonly ListedTask[] = await store.queries.pageOfList(
        input.organizationId,
        input.listId,
        filter,
        input.order,
        input.after,
        input.limit + 1,
      );
      const page: Slice<ListedTask, TaskPosition> = this.pages.slice(
        rows,
        input.limit,
        (row: ListedTask): TaskPosition => row.position,
      );
      const total: number = await store.queries.countOfList(
        input.organizationId,
        input.listId,
        filter,
      );
      return {
        items: page.items.map((row: ListedTask) => row.task),
        next: page.next,
        total,
      };
    });
  }
  // #endregion
}

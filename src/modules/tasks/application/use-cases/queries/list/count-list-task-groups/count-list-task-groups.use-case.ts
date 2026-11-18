import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { Slice } from '../../../../models/page/slice.model.js';
import type { ListPlacement } from '../../../../models/placement/list-placement.model.js';
import type { GroupPosition } from '../../../../models/query/group-position.model.js';
import type { TaskFilter } from '../../../../models/query/task-filter.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { TaskGroupView } from '../../../../projections/query/task-group.projection.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { PageSlicer } from '../../../../services/page/page-slicer.service.js';
import { TaskFilterBuilder } from '../../../../services/query/task-filter-builder.service.js';
import { TaskGroupOrganizer } from '../../../../services/query/task-group-organizer.service.js';
import type { CountListTaskGroupsInput } from './count-list-task-groups.input.js';
import type { CountListTaskGroupsOutput } from './count-list-task-groups.output.js';

/**
 * Class CountListTaskGroups
 *
 * @description
 * Counts the tasks of a list by status, priority or assignee, with the filters of the tasks route
 * (`GET /internal/v1/lists/{listId}/task-groups`), without a lock. An unknown list and a list of a
 * space the actor does not see (a guest sees none) get the same answer, `list-not-found`. Every
 * group is counted on each request, then the page is cut in memory: their number is bounded by the
 * ten statuses, the four priorities or the assignees of one list. `total` counts each task once: the
 * sum of the groups of a status or a priority, and a count of its own for the assignees, whom a
 * task can count in twice.
 */
export class CountListTaskGroups {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** The spaces module. */
  private readonly spaces: SpaceDirectory;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Resolves the filters of the route. */
  private readonly filters: TaskFilterBuilder;

  /** Gives the groups their order and their zeros. */
  private readonly organizer: TaskGroupOrganizer;

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
    this.organizer = new TaskGroupOrganizer();
    this.pages = new PageSlicer();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads the page of groups.
   *
   * @param {CountListTaskGroupsInput} input - The actor, the list, the grouping, the filters and
   * the page.
   * @returns {Promise<CountListTaskGroupsOutput>} The groups, where the next page starts and the
   * total.
   * @throws {TaskRefusal} `organization-not-found` or `list-not-found`.
   */
  public async execute(input: CountListTaskGroupsInput): Promise<CountListTaskGroupsOutput> {
    return this.unitOfWork.runReadOnly(
      async (store: TasksStore): Promise<CountListTaskGroupsOutput> => {
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
        const counted: readonly TaskGroupView[] = await store.queries.groupsOfList(
          input.organizationId,
          input.listId,
          filter,
          input.grouping,
        );
        const groups: readonly TaskGroupView[] = this.organizer.organize(input.grouping, counted);
        const total: number =
          input.grouping === 'assignee'
            ? await store.queries.countOfList(input.organizationId, input.listId, filter)
            : groups.reduce((sum: number, group: TaskGroupView): number => sum + group.count, 0);
        const page: Slice<TaskGroupView, GroupPosition> = this.pages.slice(
          this.organizer.after(input.grouping, groups, input.after),
          input.limit,
          (group: TaskGroupView): GroupPosition => ({ value: group.value, count: group.count }),
        );
        return { grouping: input.grouping, items: page.items, next: page.next, total };
      },
    );
  }
  // #endregion
}

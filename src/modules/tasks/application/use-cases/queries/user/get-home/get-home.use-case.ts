import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { ListedTask } from '../../../../models/query/listed-task.model.js';
import type { PlacedList } from '../../../../models/placement/placed-list.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { ReadonlyTasksStore } from '../../../../models/transactions/readonly-tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { TaskCountsView } from '../../../../projections/count/task-counts.projection.js';
import type { HomeStatsView } from '../../../../projections/user/home-stats.projection.js';
import { ListSummaryBuilder } from '../../../../services/count/list-summary-builder.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import type { GetHomeInput } from './get-home.input.js';
import type { GetHomeOutput } from './get-home.output.js';

/** How many tasks "Mes priorités" shows (`openapi/public/tasks.yaml:1472-1473`). */
const PRIORITY_COUNT: number = 7;

/** How many current sprints "Accueil" shows at most (`openapi/public/tasks.yaml:1474-1476`). */
const SPRINT_COUNT: number = 10;

/** How many lists "Listes" shows (`openapi/public/tasks.yaml:1477-1478`). */
const LIST_COUNT: number = 6;

/** What "Accueil" answers when the actor has a role on no list: zeros and empty lists. */
const EMPTY_HOME: GetHomeOutput = {
  stats: { assigned: 0, late: 0, dueToday: 0, done: 0 },
  priorities: [],
  sprints: [],
  lists: [],
};

/**
 * Class GetHome
 *
 * @description
 * Reads the task part of "Accueil" of the actor (`GET /internal/v1/users/{userId}/home`) in one
 * read-only transaction on one snapshot (repeatable read), so that the counters, the priorities and
 * the counts of the lists agree even while writers commit, without a lock.
 *
 * - `stats` and `priorities` cover the tasks assigned to the actor in the lists they have a role
 *   on, subtasks included; `priorities` are seven tasks that are not closed, by due date (undated last) then
 *   creation.
 * - `sprints` and `lists` carry the counts of the top-level tasks of the list, subtasks left out,
 *   as everywhere else. The first six lists in the order of the sidebar include the sprints, a
 *   sprint being a list (`openapi/internal/task-service.yaml:2018-2019`).
 *
 * A `userId` other than the actor answers `user-not-found`, checked before the membership copy is
 * read. The lists come from the spaces module (a guest has a role on the lists shared with them
 * only); an actor with a role on no list gets zeros and empty lists without a read of the tasks.
 */
export class GetHome {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** The spaces module. */
  private readonly spaces: SpaceDirectory;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Pairs the lists with their counts. */
  private readonly summaries: ListSummaryBuilder;
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
    this.summaries = new ListSummaryBuilder();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads "Accueil".
   *
   * @param {GetHomeInput} input - The actor, the `userId` of the path and the date of the caller.
   * @returns {Promise<GetHomeOutput>} The counters, the priorities, the sprints and the lists.
   * @throws {TaskRefusal} `user-not-found` or `organization-not-found`.
   */
  public async execute(input: GetHomeInput): Promise<GetHomeOutput> {
    if (input.userId.toLowerCase() !== input.actorUserId.toLowerCase()) {
      throw new TaskRefusal({ reason: 'user-not-found' });
    }
    return this.unitOfWork.runReadOnly(
      async (store: ReadonlyTasksStore): Promise<GetHomeOutput> => {
        const viewer: Viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
        const listIds: readonly string[] = await this.spaces.visibleListIds(
          input.organizationId,
          viewer,
        );
        if (listIds.length === 0) {
          return EMPTY_HOME;
        }
        const stats: HomeStatsView = await store.counter.homeStatsOf(
          input.organizationId,
          viewer.userId,
          listIds,
          input.today,
        );
        const priorities: readonly ListedTask[] = await store.assigned.pageAssignedTo(
          input.organizationId,
          viewer.userId,
          listIds,
          'open',
          null,
          PRIORITY_COUNT,
        );
        const sprints: readonly PlacedList[] = await this.spaces.currentSprints(
          input.organizationId,
          viewer,
          input.today,
          SPRINT_COUNT,
        );
        const lists: readonly PlacedList[] = await this.spaces.sidebarLists(
          input.organizationId,
          viewer,
          LIST_COUNT,
        );
        const counts: ReadonlyMap<string, TaskCountsView> = await store.counter.countsOfLists(
          input.organizationId,
          [...new Set<string>([...sprints, ...lists].map((list: PlacedList): string => list.id))],
          input.today,
        );
        return {
          stats,
          priorities: priorities.map((row: ListedTask) => row.task),
          sprints: this.summaries.build(sprints, counts),
          lists: this.summaries.build(lists, counts),
        };
      },
      { snapshot: true },
    );
  }
  // #endregion
}

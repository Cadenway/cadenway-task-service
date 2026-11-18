import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { PagePosition } from '../../../../models/page/page-position.model.js';
import type { Slice } from '../../../../models/page/slice.model.js';
import type { PlacedList } from '../../../../models/placement/placed-list.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { TaskCountsView } from '../../../../projections/count/task-counts.projection.js';
import { ListSummaryBuilder } from '../../../../services/count/list-summary-builder.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { PageSlicer } from '../../../../services/page/page-slicer.service.js';
import type { GetSpaceOverviewInput } from './get-space-overview.input.js';
import type { GetSpaceOverviewOutput } from './get-space-overview.output.js';

/**
 * Class GetSpaceOverview
 *
 * @description
 * Reads the lists of a space the actor sees with the counts of their top-level tasks, in the order
 * of their creation, one keyset page at a time (`GET /internal/v1/spaces/{spaceId}/overview`),
 * without a lock, in one read-only transaction on one snapshot (repeatable read), so that the page,
 * `listCount` and `taskCount` agree even while writers commit ("4 listes · 108 tâches"). An unknown
 * space and a space the actor does not see (a guest sees none) get the same answer,
 * `space-not-found`. `listCount` and `taskCount` cover the whole space on every page: the counts
 * are read for every list of the space in one statement, and the page is cut from them in memory.
 */
export class GetSpaceOverview {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** The spaces module. */
  private readonly spaces: SpaceDirectory;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Pairs the lists with their counts. */
  private readonly summaries: ListSummaryBuilder;

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
    this.summaries = new ListSummaryBuilder();
    this.pages = new PageSlicer();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads the page of the overview.
   *
   * @param {GetSpaceOverviewInput} input - The actor, the space, the date of the caller and the
   * page.
   * @returns {Promise<GetSpaceOverviewOutput>} The lists with their counts, where the next page
   * starts, and the number of lists and of tasks of the space.
   * @throws {TaskRefusal} `organization-not-found` or `space-not-found`.
   */
  public async execute(input: GetSpaceOverviewInput): Promise<GetSpaceOverviewOutput> {
    return this.unitOfWork.runReadOnly(
      async (store: TasksStore): Promise<GetSpaceOverviewOutput> => {
        const viewer: Viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
        const lists: readonly PlacedList[] | null = await this.spaces.findVisibleSpaceLists(
          input.organizationId,
          viewer,
          input.spaceId,
        );
        if (lists === null) {
          throw new TaskRefusal({ reason: 'space-not-found' });
        }
        const counts: ReadonlyMap<string, TaskCountsView> = await store.counter.countsOfLists(
          input.organizationId,
          lists.map((list: PlacedList): string => list.id),
          input.today,
        );
        const page: Slice<PlacedList, PagePosition> = this.pages.slice(
          lists.filter((list: PlacedList): boolean => this.follows(list, input.after)),
          input.limit,
          (list: PlacedList): PagePosition => ({ createdAt: list.createdAt, id: list.id }),
        );
        return {
          spaceId: input.spaceId,
          listCount: lists.length,
          taskCount: lists.reduce(
            (sum: number, list: PlacedList): number => sum + (counts.get(list.id)?.total ?? 0),
            0,
          ),
          items: this.summaries.build(page.items, counts),
          next: page.next,
        };
      },
      { snapshot: true },
    );
  }

  /**
   * Method follows
   *
   * @description
   * Whether a list comes after a position in the order of creation, the id breaking the ties.
   *
   * @param {PlacedList} list - The list.
   * @param {PagePosition | null} after - The last list of the previous page, `null` for the first.
   * @returns {boolean} Whether the list belongs to the page or a later one.
   */
  private follows(list: PlacedList, after: PagePosition | null): boolean {
    if (after === null) {
      return true;
    }
    const delta: number = list.createdAt.getTime() - after.createdAt.getTime();
    return delta > 0 || (delta === 0 && list.id > after.id);
  }
  // #endregion
}

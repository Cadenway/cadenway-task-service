import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { ArchivePosition } from '../../../../models/archive/archive-position.model.js';
import type { Slice } from '../../../../models/page/slice.model.js';
import type { ArchivedLists } from '../../../../models/placement/archived-lists.model.js';
import type { PlacedList } from '../../../../models/placement/placed-list.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { ArchivedListView } from '../../../../projections/archive/archived-list.projection.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { PageSlicer } from '../../../../services/page/page-slicer.service.js';
import type { ListArchivedListsInput } from './list-archived-lists.input.js';
import type { ListArchivedListsOutput } from './list-archived-lists.output.js';

/**
 * Class ListArchivedLists
 *
 * @description
 * Lists the archived lists the actor has a role on ("Archives", tab "Listes";
 * `GET /internal/v1/archives/lists`), the most recently archived first (`archived_at desc, id
 * desc`), each with the role of the actor, its archive and the number of its live top-level tasks
 * ("Produit · 14 tâches"), and `total` on every page. The tasks module serves it because the count
 * needs its tables; the lists, their order and the roles come from the spaces module. It runs in
 * one read-only snapshot (`REPEATABLE READ`), so the page, the total and the counts agree; it takes
 * no lock. An empty page reads no task.
 */
export class ListArchivedLists {
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
   * Reads the page.
   *
   * @param {ListArchivedListsInput} input - The actor and the page.
   * @returns {Promise<ListArchivedListsOutput>} The lists, where the next page starts and the
   * total.
   * @throws {TaskRefusal} `organization-not-found`.
   * @throws {Error} When an archived list of the spaces module has no archive instant, a defect.
   */
  public async execute(input: ListArchivedListsInput): Promise<ListArchivedListsOutput> {
    return this.unitOfWork.runReadOnly(
      async (store: TasksStore): Promise<ListArchivedListsOutput> => {
        const { organizationId } = input;
        const viewer: Viewer = await this.viewers.resolve(organizationId, input.actorUserId);
        const archived: ArchivedLists = await this.spaces.archivedLists(
          organizationId,
          viewer,
          input.after,
          input.limit + 1,
        );
        const page: Slice<PlacedList, ArchivePosition> = this.pages.slice(
          archived.lists,
          input.limit,
          (list: PlacedList): ArchivePosition => {
            if (list.archivedAt === null) {
              throw new Error(`The archived list ${list.id} has no archive instant.`);
            }
            return { archivedAt: list.archivedAt, id: list.id };
          },
        );
        if (page.items.length === 0) {
          return { items: [], next: null, total: archived.total };
        }
        const counts: ReadonlyMap<string, number> = await store.archives.liveRootCounts(
          organizationId,
          page.items.map((list: PlacedList): string => list.id),
        );
        return {
          items: page.items.map((list: PlacedList): ArchivedListView => ({
            list,
            taskCount: counts.get(list.id) ?? 0,
          })),
          next: page.next,
          total: archived.total,
        };
      },
      { snapshot: true },
    );
  }
  // #endregion
}

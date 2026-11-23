import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { ArchivePosition } from '../../../../models/archive/archive-position.model.js';
import type { Slice } from '../../../../models/page/slice.model.js';
import type { PlacedList } from '../../../../models/placement/placed-list.model.js';
import type { ReadonlyTasksStore } from '../../../../models/transactions/readonly-tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { ArchivedRootView } from '../../../../projections/archive/archived-root.projection.js';
import type { ArchivedTaskView } from '../../../../projections/archive/archived-task.projection.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { PageSlicer } from '../../../../services/page/page-slicer.service.js';
import type { ListArchivedTasksInput } from './list-archived-tasks.input.js';
import type { ListArchivedTasksOutput } from './list-archived-tasks.output.js';

/**
 * Class ListArchivedTasks
 *
 * @description
 * Lists the roots of the archives the actor sees ("Archives", tab "Tâches";
 * `GET /internal/v1/archives/tasks`), the most recently archived first (`archived_at desc, id
 * desc`), with their list as it is now (`archived` when the list is archived too), the number of
 * subtasks archived with each and `total` on every page. A root is seen when the actor has a role
 * on its list (`visibleListIds`, archived lists included); an actor with a role on no list gets an
 * empty page and a total of 0 without a read of the tasks. It runs in one read-only snapshot
 * (`REPEATABLE READ`), so the page, the total, the counts and the lists agree; it takes no lock.
 * Statements: the copy of the memberships, the visible lists, the page (with the five of its
 * summaries), the total, the member counts and the lists of the page, whatever the page size.
 */
export class ListArchivedTasks {
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
   * @param {ListArchivedTasksInput} input - The actor and the page.
   * @returns {Promise<ListArchivedTasksOutput>} The roots, where the next page starts and the
   * total.
   * @throws {TaskRefusal} `organization-not-found`.
   * @throws {Error} When the list of a root of the page is not among the lists the actor sees, a
   * defect in one snapshot.
   */
  public async execute(input: ListArchivedTasksInput): Promise<ListArchivedTasksOutput> {
    return this.unitOfWork.runReadOnly(
      async (store: ReadonlyTasksStore): Promise<ListArchivedTasksOutput> => {
        const { organizationId } = input;
        const viewer: Viewer = await this.viewers.resolve(organizationId, input.actorUserId);
        const listIds: readonly string[] = await this.spaces.visibleListIds(organizationId, viewer);
        if (listIds.length === 0) {
          return { items: [], next: null, total: 0 };
        }
        const rows: readonly ArchivedRootView[] = await store.archives.pageOfRoots(
          organizationId,
          listIds,
          input.after,
          input.limit + 1,
        );
        const page: Slice<ArchivedRootView, ArchivePosition> = this.pages.slice(
          rows,
          input.limit,
          (row: ArchivedRootView): ArchivePosition => ({
            archivedAt: row.archivedAt,
            id: row.task.id,
          }),
        );
        const total: number = await store.archives.countRoots(organizationId, listIds);
        if (page.items.length === 0) {
          return { items: [], next: null, total };
        }
        const members: ReadonlyMap<string, number> = await store.archives.memberCounts(
          organizationId,
          page.items.map((row: ArchivedRootView): string => row.task.id),
        );
        const lists: ReadonlyMap<string, PlacedList> = new Map(
          (
            await this.spaces.findVisibleLists(organizationId, viewer, [
              ...new Set(page.items.map((row: ArchivedRootView): string => row.task.listId)),
            ])
          ).map((list: PlacedList): [string, PlacedList] => [list.id, list]),
        );
        return {
          items: page.items.map((row: ArchivedRootView): ArchivedTaskView =>
            this.toItem(row, lists, members),
          ),
          next: page.next,
          total,
        };
      },
      { snapshot: true },
    );
  }

  /**
   * Method toItem
   *
   * @description
   * Builds an item of the page from its root, its list and the size of its archive.
   *
   * @param {ArchivedRootView} row - The root.
   * @param {ReadonlyMap<string, PlacedList>} lists - The lists of the page by id.
   * @param {ReadonlyMap<string, number>} members - The members of each archive, by root id.
   * @returns {ArchivedTaskView} The item.
   * @throws {Error} When the list of the root is not among the lists of the page.
   */
  private toItem(
    row: ArchivedRootView,
    lists: ReadonlyMap<string, PlacedList>,
    members: ReadonlyMap<string, number>,
  ): ArchivedTaskView {
    const list: PlacedList | undefined = lists.get(row.task.listId);
    if (list === undefined) {
      throw new Error(
        `The list ${row.task.listId} of the archived task ${row.task.key} is unseen.`,
      );
    }
    return {
      task: row.task,
      list: {
        id: list.id,
        spaceId: list.spaceId,
        name: list.name,
        state: list.archivedAt === null ? 'active' : 'archived',
      },
      subtaskCount: Math.max((members.get(row.task.id) ?? 1) - 1, 0),
      archivedAt: row.archivedAt,
      archivedBy: row.archivedBy,
    };
  }
  // #endregion
}

import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { PagePosition } from '../../../../models/page/page-position.model.js';
import type { Slice } from '../../../../models/page/slice.model.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { TaskSummaryView } from '../../../../projections/task/task-summary.projection.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { PageSlicer } from '../../../../services/page/page-slicer.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import type { ListSubtasksInput } from './list-subtasks.input.js';
import type { ListSubtasksOutput } from './list-subtasks.output.js';

/**
 * Class ListSubtasks
 *
 * @description
 * Lists the direct subtasks of a task, in the order of their creation, one keyset page at a time
 * (`GET /internal/v1/tasks/{taskKey}/subtasks`), without a lock. It reads one row more than the
 * page to know whether another follows, and counts the subtasks in the same read-only transaction.
 * Visibility is that of the parent (`task-not-found`).
 */
export class ListSubtasks {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Finds the parent. */
  private readonly locator: TaskLocator;

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
    this.viewers = new ViewerResolver(members);
    this.locator = new TaskLocator(spaces);
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
   * @param {ListSubtasksInput} input - The actor, the parent and the page.
   * @returns {Promise<ListSubtasksOutput>} The subtasks, where the next page starts and the total.
   * @throws {TaskRefusal} `organization-not-found` or `task-not-found`.
   */
  public async execute(input: ListSubtasksInput): Promise<ListSubtasksOutput> {
    return this.unitOfWork.runReadOnly(async (store: TasksStore): Promise<ListSubtasksOutput> => {
      const viewer: Viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
      const { task }: LocatedTask = await this.locator.locate(store, {
        organizationId: input.organizationId,
        viewer,
        taskKey: input.taskKey,
        lock: false,
        expectedVersions: null,
      });
      const rows: readonly TaskSummaryView[] = await store.reader.childrenOf(
        input.organizationId,
        task.snapshot.id,
        input.after,
        input.limit + 1,
      );
      const page: Slice<TaskSummaryView, PagePosition> = this.pages.slice(
        rows,
        input.limit,
        (row: TaskSummaryView): PagePosition => ({ createdAt: row.createdAt, id: row.id }),
      );
      const total: number = await store.reader.countChildren(
        input.organizationId,
        task.snapshot.id,
      );
      return { items: page.items, next: page.next, total };
    });
  }
  // #endregion
}

import type { ActivityEntryState } from '../../../../../domain/value-objects/activity/activity-entry-state.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { ActivityPosition } from '../../../../models/activity/activity-position.model.js';
import type { Slice } from '../../../../models/page/slice.model.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { ActivityEntryView } from '../../../../projections/activity/activity-entry-view.projection.js';
import { ActivityViewBuilder } from '../../../../services/activity/activity-view-builder.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { PageSlicer } from '../../../../services/page/page-slicer.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import type { ListTaskActivityInput } from './list-task-activity.input.js';
import type { ListTaskActivityOutput } from './list-task-activity.output.js';

/**
 * Class ListTaskActivity
 *
 * @description
 * Lists the activity of a task, most recent first, one keyset page at a time
 * (`GET /internal/v1/tasks/{taskKey}/activity`), without a lock. `total` counts the entries that
 * match the kinds, whatever the page. Visibility is that of the task (`task-not-found`).
 */
export class ListTaskActivity {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Finds the task. */
  private readonly locator: TaskLocator;

  /** Cuts the page. */
  private readonly pages: PageSlicer;

  /** Adds the task to each entry. */
  private readonly views: ActivityViewBuilder;
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
    this.views = new ActivityViewBuilder();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads the page.
   *
   * @param {ListTaskActivityInput} input - The actor, the task, the kinds and the page.
   * @returns {Promise<ListTaskActivityOutput>} The entries, where the next page starts and the
   * total.
   * @throws {TaskRefusal} `organization-not-found` or `task-not-found`.
   */
  public async execute(input: ListTaskActivityInput): Promise<ListTaskActivityOutput> {
    return this.unitOfWork.runReadOnly(
      async (store: TasksStore): Promise<ListTaskActivityOutput> => {
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
        const rows: readonly ActivityEntryState[] = await store.activity.pageOfTask(
          input.organizationId,
          task.snapshot.id,
          input.kinds,
          input.after,
          input.limit + 1,
        );
        const page: Slice<ActivityEntryState, ActivityPosition> = this.pages.slice(
          rows,
          input.limit,
          (row: ActivityEntryState): ActivityPosition => ({
            occurredAt: row.occurredAt,
            id: row.id,
          }),
        );
        const total: number = await store.activity.countOfTask(
          input.organizationId,
          task.snapshot.id,
          input.kinds,
        );
        const items: readonly ActivityEntryView[] = await this.views.build(
          store.reader,
          input.organizationId,
          page.items,
        );
        return { items, next: page.next, total };
      },
    );
  }
  // #endregion
}

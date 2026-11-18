import type { ActivityEntryState } from '../../../../../domain/value-objects/activity/activity-entry-state.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { ActivityPosition } from '../../../../models/activity/activity-position.model.js';
import type { ListActivityFilter } from '../../../../models/activity/list-activity-filter.model.js';
import type { Slice } from '../../../../models/page/slice.model.js';
import type { ListPlacement } from '../../../../models/placement/list-placement.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { ActivityEntryView } from '../../../../projections/activity/activity-entry-view.projection.js';
import { ActivityViewBuilder } from '../../../../services/activity/activity-view-builder.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { PageSlicer } from '../../../../services/page/page-slicer.service.js';
import type { ListListActivityInput } from './list-list-activity.input.js';
import type { ListListActivityOutput } from './list-list-activity.output.js';

/**
 * Class ListListActivity
 *
 * @description
 * Lists the activity recorded while tasks were in a list, most recent first, one keyset page at a
 * time (`GET /internal/v1/lists/{listId}/activity`), without a lock. An unknown list and a list of
 * a space the actor does not see (a guest sees none) get the same answer, `list-not-found`. Entries
 * of a task that is now in a space the actor does not see are left out of the items and of the
 * total; a task now in another visible list stays included. `total` counts the entries that match
 * the filters, whatever the page.
 */
export class ListListActivity {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** The spaces module. */
  private readonly spaces: SpaceDirectory;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

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
    this.spaces = spaces;
    this.viewers = new ViewerResolver(members);
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
   * @param {ListListActivityInput} input - The actor, the list, the filters and the page.
   * @returns {Promise<ListListActivityOutput>} The entries, where the next page starts and the
   * total.
   * @throws {TaskRefusal} `organization-not-found` or `list-not-found`.
   */
  public async execute(input: ListListActivityInput): Promise<ListListActivityOutput> {
    return this.unitOfWork.runReadOnly(
      async (store: TasksStore): Promise<ListListActivityOutput> => {
        const viewer: Viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
        const placement: ListPlacement | null = await this.spaces.findVisibleList(
          input.organizationId,
          viewer,
          input.listId,
        );
        if (placement === null) {
          throw new TaskRefusal({ reason: 'list-not-found' });
        }
        const filter: ListActivityFilter = {
          listId: input.listId,
          spaceIds: await this.spaces.visibleSpaceIds(input.organizationId, viewer),
          kinds: input.kinds,
          actorIds: input.actorIds,
        };
        const rows: readonly ActivityEntryState[] = await store.activity.pageOfList(
          input.organizationId,
          filter,
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
        const total: number = await store.activity.countOfList(input.organizationId, filter);
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

import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import type { ListSpaceMilestonesInput } from './list-space-milestones.input.js';
import type { ListSpaceMilestonesOutput } from './list-space-milestones.output.js';

/** Lists and counts milestones only in the nonarchived lists the caller sees. */
export class ListSpaceMilestones {
  // #region Properties
  /** Resolves the actor from the tenant's membership projection. */
  private readonly viewers: ViewerResolver;
  // #endregion

  // #region Constructor
  /** Binds milestone reads to the tenant snapshot and the space directory. */
  public constructor(
    private readonly unit: TasksUnitOfWork,
    members: MemberDirectory,
    private readonly spaces: SpaceDirectory,
  ) {
    this.viewers = new ViewerResolver(members);
  }
  // #endregion

  // #region Methods
  /** Reads authorization, the page and its total in one repeatable-read snapshot. */
  public async execute(input: ListSpaceMilestonesInput): Promise<ListSpaceMilestonesOutput> {
    return this.unit.runReadOnly(
      async (store): Promise<ListSpaceMilestonesOutput> => {
        const viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
        const lists = await this.spaces.findVisibleSpaceLists(
          input.organizationId,
          viewer,
          input.spaceId,
        );
        if (lists === null) throw new TaskRefusal({ reason: 'space-not-found' });
        if (lists.length === 0) return { items: [], next: null, total: 0 };

        const listIds = lists.map((list) => list.id);
        const rows = await store.queries.milestones(
          input.organizationId,
          listIds,
          input.after,
          input.limit + 1,
        );
        const total = await store.queries.milestoneTotal(input.organizationId, listIds);
        const items = rows.slice(0, input.limit);
        const last = rows.length > input.limit ? items.at(-1) : undefined;
        return {
          items,
          total,
          next: last === undefined ? null : { dueDate: last.dueDate, id: last.id },
        };
      },
      { snapshot: true },
    );
  }
  // #endregion
}

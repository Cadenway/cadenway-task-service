import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import { EffectiveWatchers } from '../../../../services/watcher/effective-watchers.service.js';
import type { ListWatchersInput } from './list-watchers.input.js';
import type { ListWatchersOutput } from './list-watchers.output.js';

/** Reads effective watcher IDs from one repeatable tenant snapshot. */
export class ListWatchers {
  // #region Properties
  /** Tenant transaction. */
  private readonly unit: TasksUnitOfWork;

  /** Subscriber policy and eligibility. */
  private readonly watchers: EffectiveWatchers;

  /** Caller resolver. */
  private readonly viewers: ViewerResolver;

  /** Task visibility resolver. */
  private readonly locator: TaskLocator;
  // #endregion
  // #region Constructor
  /** Binds the task transaction and directories. */
  public constructor(unit: TasksUnitOfWork, members: MemberDirectory, spaces: SpaceDirectory) {
    this.unit = unit;
    this.watchers = new EffectiveWatchers(members, spaces);
    this.viewers = new ViewerResolver(members);
    this.locator = new TaskLocator(spaces);
  }
  // #endregion
  // #region Methods
  /** Returns only current members who can read the task's list. */
  public async execute(input: ListWatchersInput): Promise<ListWatchersOutput> {
    return this.unit.runReadOnly(
      async (store: TasksStore): Promise<ListWatchersOutput> => {
        const viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
        const { task } = await this.locator.locate(store, {
          organizationId: input.organizationId,
          viewer,
          taskKey: input.taskKey,
          edit: false,
          lock: false,
          archived: 'allow',
          expectedVersions: null,
        });
        const all = await this.watchers.forTask(store, task.snapshot);
        const page = all
          .filter((id) => input.after === null || id > input.after)
          .slice(0, input.limit + 1);
        const hasMore = page.length > input.limit;
        const userIds = page.slice(0, input.limit);
        return {
          userIds,
          next: hasMore ? (userIds.at(-1) ?? null) : null,
          total: all.length,
          callerFollows: all.includes(input.actorUserId.toLowerCase()),
        };
      },
      { snapshot: true },
    );
  }
  // #endregion
}

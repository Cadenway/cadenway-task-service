import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { TimeTaskAccess } from '../../../../services/time/time-task-access.service.js';
import { PageSlicer } from '../../../../services/page/page-slicer.service.js';
import type { ListTaskTimeEntriesInput } from './list-task-time-entries.input.js';
import type { ListTaskTimeEntriesOutput } from './list-task-time-entries.output.js';

/** ListTaskTimeEntries for a visible task. */
export class ListTaskTimeEntries {
  // #region Properties
  /** The dependencies of this operation. */
  private readonly access: TimeTaskAccess;
  // #endregion

  // #region Constructor
  /** Initializes the operation with its transaction and access directories. */
  public constructor(
    private readonly unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ) {
    this.access = new TimeTaskAccess(members, spaces);
  }
  // #endregion

  // #region Methods
  /** Runs the operation in the requested transaction. */
  public async execute(input: ListTaskTimeEntriesInput): Promise<ListTaskTimeEntriesOutput> {
    return this.unitOfWork.runReadOnly(
      async (store: TasksStore): Promise<ListTaskTimeEntriesOutput> => {
        const { task } = await this.access.locate(store, input, 'read');
        const rows = await store.time.page(
          input.organizationId,
          task.snapshot.id,
          input.after,
          input.limit + 1,
        );
        const page = new PageSlicer().slice(rows, input.limit, (entry) => ({
          createdAt: entry.createdAt,
          id: entry.id,
        }));
        const totals = await store.time.totals(input.organizationId, task.snapshot.id);
        return {
          items: page.items.map((entry) => ({ ...entry, taskKey: task.snapshot.key.format() })),
          next: page.next,
          ...totals,
        };
      },
      { snapshot: true },
    );
  }
  // #endregion
}

import type { ReadonlyTasksStore } from '../../../../models/transactions/readonly-tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { TimeTaskAccess } from '../../../../services/time/time-task-access.service.js';
import type { GetTaskTimeSummaryInput } from './get-task-time-summary.input.js';
import type { GetTaskTimeSummaryOutput } from './get-task-time-summary.output.js';

/** GetTaskTimeSummary for a visible task. */
export class GetTaskTimeSummary {
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
  public async execute(input: GetTaskTimeSummaryInput): Promise<GetTaskTimeSummaryOutput> {
    return this.unitOfWork.runReadOnly(
      async (store: ReadonlyTasksStore): Promise<GetTaskTimeSummaryOutput> => {
        const { task } = await this.access.locate(store, input, 'read');
        const { totalMinutes } = await store.time.totals(input.organizationId, task.snapshot.id);
        const estimate = task.snapshot.estimateMinutes;
        return { totalMinutes, estimateMinutes: estimate === 0 ? null : estimate };
      },
      { snapshot: true },
    );
  }
  // #endregion
}

import type { ReadonlyTasksStore } from '../../../../models/transactions/readonly-tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { TimeTaskAccess } from '../../../../services/time/time-task-access.service.js';
import { StatusDurationHistory } from '../../../../../domain/policies/activity/status-duration.policy.js';
import type { ActivityPosition } from '../../../../models/activity/activity-position.model.js';
import type { GetTaskStatusDurationsInput } from './get-task-status-durations.input.js';
import type { GetTaskStatusDurationsOutput } from './get-task-status-durations.output.js';

/** GetTaskStatusDurations for a visible task. */
export class GetTaskStatusDurations {
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
  public async execute(input: GetTaskStatusDurationsInput): Promise<GetTaskStatusDurationsOutput> {
    return this.unitOfWork.runReadOnly(
      async (store: ReadonlyTasksStore): Promise<GetTaskStatusDurationsOutput> => {
        const { task } = await this.access.locate(store, input, 'read');
        if (task.snapshot.milestone === true) return { summary: null };
        let page = await store.time.statusHistoryPage(
          input.organizationId,
          task.snapshot.id,
          null,
          500,
        );
        const observedAt = await store.time.observationTime();
        const history = new StatusDurationHistory(task.snapshot, observedAt);
        for (;;) {
          for (const entry of page) {
            if (!history.include(entry)) return { summary: history.summarize() };
          }
          const last = page.at(-1);
          if (page.length < 500 || last === undefined) break;
          const after: ActivityPosition = { occurredAt: last.occurredAt, id: last.id };
          page = await store.time.statusHistoryPage(
            input.organizationId,
            task.snapshot.id,
            after,
            500,
          );
        }
        return { summary: history.summarize() };
      },
      { snapshot: true },
    );
  }
  // #endregion
}

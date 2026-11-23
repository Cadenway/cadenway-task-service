import type { ReadonlyTasksStore } from '../../../../models/transactions/readonly-tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { TimeTaskAccess } from '../../../../services/time/time-task-access.service.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { GetTaskTimeEntryInput } from './get-task-time-entry.input.js';
import type { GetTaskTimeEntryOutput } from './get-task-time-entry.output.js';

/** GetTaskTimeEntry for a visible task. */
export class GetTaskTimeEntry {
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
  public async execute(input: GetTaskTimeEntryInput): Promise<GetTaskTimeEntryOutput> {
    return this.unitOfWork.runReadOnly(
      async (store: ReadonlyTasksStore): Promise<GetTaskTimeEntryOutput> => {
        const { task } = await this.access.locate(store, input, 'read');
        const entry = await store.time.find(
          input.organizationId,
          task.snapshot.id,
          input.timeEntryId,
        );
        if (entry === null) throw new TaskRefusal({ reason: 'time-entry-not-found' });
        return { ...entry, taskKey: task.snapshot.key.format() };
      },
      { snapshot: true },
    );
  }
  // #endregion
}

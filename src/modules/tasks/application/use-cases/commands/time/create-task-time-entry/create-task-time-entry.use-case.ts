import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { TimeTaskAccess } from '../../../../services/time/time-task-access.service.js';
import type { TimeTaskActor } from '../../../../models/time/time-task-actor.model.js';
import { normalizeTimeEntry } from '../../../../../domain/value-objects/time/time-entry-details.value-object.js';
import type { CreateTaskTimeEntryInput } from './create-task-time-entry.input.js';
import type { CreateTaskTimeEntryOutput } from './create-task-time-entry.output.js';

/** CreateTaskTimeEntry for a visible task. */
export class CreateTaskTimeEntry {
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
  public async execute(input: CreateTaskTimeEntryInput): Promise<CreateTaskTimeEntryOutput> {
    return this.unitOfWork.run(async (store: TasksStore): Promise<CreateTaskTimeEntryOutput> => {
      const { task } = await this.access.locate(store, input, 'write');
      const details = normalizeTimeEntry({
        minutes: input.minutes,
        workDate: input.workDate,
        ...(input.note === null ? {} : { note: input.note }),
      });
      const entry = await store.time.create(
        input.organizationId,
        task.snapshot.id,
        input.actorUserId,
        details.minutes,
        details.workDate,
        details.note,
      );
      return { ...entry, taskKey: task.snapshot.key.format() };
    });
  }

  /** Rechecks access before returning a cached idempotent response. */
  public async assertCanReplay(input: TimeTaskActor): Promise<void> {
    await this.unitOfWork.runReadOnly(
      async (store: TasksStore): Promise<void> => {
        await this.access.locate(store, input, 'replay');
      },
      { snapshot: true },
    );
  }
  // #endregion
}

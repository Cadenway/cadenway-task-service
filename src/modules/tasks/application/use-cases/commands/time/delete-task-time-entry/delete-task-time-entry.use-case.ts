import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { TimeTaskAccess } from '../../../../services/time/time-task-access.service.js';
import { assertTimeEntryAuthor } from '../../../../../domain/policies/time/time-entry-author.policy.js';
import { TimeEntryAuthorRequiredError } from '../../../../../domain/errors/time/time-entry-author-required.error.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { DeleteTaskTimeEntryInput } from './delete-task-time-entry.input.js';
import type { DeleteTaskTimeEntryOutput } from './delete-task-time-entry.output.js';

/** DeleteTaskTimeEntry for a visible task. */
export class DeleteTaskTimeEntry {
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
  public async execute(input: DeleteTaskTimeEntryInput): Promise<DeleteTaskTimeEntryOutput> {
    return this.unitOfWork.run(async (store: TasksStore): Promise<DeleteTaskTimeEntryOutput> => {
      const { task } = await this.access.locate(store, input, 'write');
      const entry = await store.time.find(
        input.organizationId,
        task.snapshot.id,
        input.timeEntryId,
      );
      if (entry === null) throw new TaskRefusal({ reason: 'time-entry-not-found' });
      try {
        assertTimeEntryAuthor(entry.authorUserId, input.actorUserId);
      } catch (error: unknown) {
        if (error instanceof TimeEntryAuthorRequiredError)
          throw new TaskRefusal({ reason: 'time-entry-author-required' });
        throw error;
      }
      const removed = await store.time.remove(
        input.organizationId,
        task.snapshot.id,
        entry.id,
        input.actorUserId,
      );
      if (!removed) throw new TaskRefusal({ reason: 'time-entry-not-found' });
      return undefined;
    });
  }
  // #endregion
}

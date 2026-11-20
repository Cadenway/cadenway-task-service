import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { RemoveMemberWatcherOverridesInput } from './remove-member-watcher-overrides.input.js';
import type { RemoveMemberWatcherOverridesOutput } from './remove-member-watcher-overrides.output.js';

/** The maximum number of tasks locked in one cleanup transaction. */
const BATCH_SIZE: number = 500;

/**
 * Clears one batch of explicit watcher overrides left by a former member. A read of the
 * membership after the ordered task locks protects overrides applied after a re-join, as
 * any watcher write must hold its task lock. There is no task change or event.
 */
export class RemoveMemberWatcherOverrides {
  // #region Constructor
  /**
   * Binds the tenant transactions and the local membership directory.
   *
   * @param unitOfWork - Starts a transaction for each batch.
   * @param members - Reads membership in the same transaction.
   */
  public constructor(
    private readonly unitOfWork: TasksUnitOfWork,
    private readonly members: MemberDirectory,
  ) {}
  // #endregion

  // #region Methods
  /**
   * Locks the next tasks before checking membership and deleting the matching overrides.
   *
   * @param input - The organization, account and preceding task id.
   * @returns What the batch did.
   */
  public async execute(
    input: RemoveMemberWatcherOverridesInput,
  ): Promise<RemoveMemberWatcherOverridesOutput> {
    const { organizationId, userId, afterTaskId } = input;
    return this.unitOfWork.run(
      async (store: TasksStore): Promise<RemoveMemberWatcherOverridesOutput> => {
        const taskIds: readonly string[] = await store.watcherOverrides.lockTaskIdsForMember(
          organizationId,
          userId,
          afterTaskId,
          BATCH_SIZE,
        );
        const lastTaskId: string | undefined = taskIds.at(-1);
        if (lastTaskId === undefined) {
          return { outcome: 'none-left' };
        }
        if ((await this.members.roleOf(organizationId, userId)) !== null) {
          return { outcome: 'member-again' };
        }
        const removed: number = await store.watcherOverrides.removeForMember(
          organizationId,
          userId,
          taskIds,
        );
        return { outcome: 'removed', removed, lastTaskId };
      },
    );
  }
  // #endregion
}

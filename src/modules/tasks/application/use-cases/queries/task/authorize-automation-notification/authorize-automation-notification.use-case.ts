import { InvalidTaskError } from '../../../../../domain/errors/task/invalid-task.error.js';
import { canWriteTasksOf } from '../../../../../domain/policies/task/task-write.policy.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { DelegatedMemberships } from '../../member/delegated-memberships/delegated-memberships.use-case.js';
import type { AuthorizeAutomationNotificationInput } from './authorize-automation-notification.input.js';
import type { AuthorizeAutomationNotificationOutput } from './authorize-automation-notification.output.js';

/** Checks both accounts against the same current task placement. */
export class AuthorizeAutomationNotification {
  // #region Constructor
  /** Binds the tenant snapshot and current membership and placement directories. */
  public constructor(
    private readonly work: TasksUnitOfWork,
    private readonly spaces: SpaceDirectory,
    private readonly memberships: DelegatedMemberships,
  ) {}
  // #endregion

  // #region Methods
  /** Authorizes only an active task both accounts can access and its author can edit. */
  public async execute(
    input: AuthorizeAutomationNotificationInput,
  ): Promise<AuthorizeAutomationNotificationOutput> {
    const proof = await this.memberships.execute(input.organizationId, [
      input.ruleAuthorUserId,
      input.recipientUserId,
    ]);
    return this.work.runReadOnly(
      async (store) => {
        try {
          const author = await this.memberships.require(
            proof,
            input.organizationId,
            input.ruleAuthorUserId,
            false,
          );
          const recipient = await this.memberships.require(
            proof,
            input.organizationId,
            input.recipientUserId,
            false,
          );
          const key = TaskKey.parse(input.taskKey);
          const location = await store.reader.attachmentLocationByKey(input.organizationId, key);
          if (location === null || location.archived) {
            throw new TaskRefusal({ reason: 'task-not-found' });
          }
          const authorPlacement = await this.spaces.findVisibleList(
            input.organizationId,
            author,
            location.listId,
          );
          if (
            authorPlacement?.list.archivedAt !== null ||
            authorPlacement.space.id !== location.spaceId ||
            !canWriteTasksOf(authorPlacement.list.callerRole)
          ) {
            throw new TaskRefusal({ reason: 'task-not-found' });
          }
          const recipientPlacement = await this.spaces.findVisibleList(
            input.organizationId,
            recipient,
            location.listId,
          );
          if (
            recipientPlacement?.list.archivedAt !== null ||
            recipientPlacement.space.id !== location.spaceId
          ) {
            throw new TaskRefusal({ reason: 'task-not-found' });
          }
          return undefined;
        } catch (error: unknown) {
          if (error instanceof TaskRefusal || error instanceof InvalidTaskError) {
            throw new TaskRefusal({ reason: 'task-not-found' });
          }
          throw error;
        }
      },
      { snapshot: true },
    );
  }
  // #endregion
}

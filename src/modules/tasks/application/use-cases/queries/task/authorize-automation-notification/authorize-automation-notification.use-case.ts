import { InvalidTaskError } from '../../../../../domain/errors/task/invalid-task.error.js';
import { canWriteTasksOf } from '../../../../../domain/policies/task/task-write.policy.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import type { AuthorizeAutomationNotificationInput } from './authorize-automation-notification.input.js';
import type { AuthorizeAutomationNotificationOutput } from './authorize-automation-notification.output.js';

/** Checks both accounts against the same current task placement. */
export class AuthorizeAutomationNotification {
  // #region Properties
  /** Resolves membership from the tenant projection in the same transaction. */
  private readonly viewers: ViewerResolver;
  // #endregion

  // #region Constructor
  /** Binds the tenant snapshot and current membership and placement directories. */
  public constructor(
    private readonly work: TasksUnitOfWork,
    members: MemberDirectory,
    private readonly spaces: SpaceDirectory,
  ) {
    this.viewers = new ViewerResolver(members);
  }
  // #endregion

  // #region Methods
  /** Authorizes only an active task both accounts can access and its author can edit. */
  public execute(
    input: AuthorizeAutomationNotificationInput,
  ): Promise<AuthorizeAutomationNotificationOutput> {
    return this.work.runReadOnly(
      async (store) => {
        try {
          const author = await this.viewers.resolve(input.organizationId, input.ruleAuthorUserId);
          const recipient = await this.viewers.resolve(input.organizationId, input.recipientUserId);
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

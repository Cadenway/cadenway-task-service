import { canWriteTasksOf } from '../../../../../domain/policies/task/task-write.policy.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { taskApprovalRefusal } from '../../../../services/approval/task-approval-refusal.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import type { ReadTaskApprovalInput } from './read-task-approval.input.js';
import type { ReadTaskApprovalOutput } from './read-task-approval.output.js';

/** Reads approval state for an authorized task under one repeatable-read snapshot. */
export class ReadTaskApproval {
  // #region Properties
  /** Resolves task visibility for the caller. */
  private readonly viewers: ViewerResolver;
  private readonly locator: TaskLocator;
  // #endregion

  // #region Constructor
  /** Binds the tenant transaction and access directories. */
  public constructor(
    private readonly work: TasksUnitOfWork,
    private readonly members: MemberDirectory,
    private readonly spaces: SpaceDirectory,
  ) {
    this.viewers = new ViewerResolver(members);
    this.locator = new TaskLocator(spaces);
  }
  // #endregion

  // #region Methods
  /** Runs the approval read in the task's tenant snapshot. */
  public execute<TResult>(
    input: ReadTaskApprovalInput,
    operation: {
      discoverReviewerIds(taskId: string): Promise<readonly string[]>;
      read(context: ReadTaskApprovalOutput): Promise<TResult>;
    },
  ): Promise<TResult> {
    return this.work
      .runReadOnly(
        async (store) => {
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
          const state = task.snapshot;
          const reviewerIds = state.milestone ? [] : await operation.discoverReviewerIds(state.id);
          const eligibleReviewerIds: string[] = [];
          for (const userId of new Set(reviewerIds.map((id) => id.toLowerCase()))) {
            const role = await this.members.roleOf(input.organizationId, userId);
            if (role === null) continue;
            const placement = await this.spaces.findVisibleList(
              input.organizationId,
              { userId, role },
              state.listId,
            );
            if (placement !== null && canWriteTasksOf(placement.list.callerRole)) {
              eligibleReviewerIds.push(userId);
            }
          }
          return operation.read({
            taskId: state.id,
            taskKey: state.key.format(),
            organizationId: state.organizationId,
            listId: state.listId,
            spaceId: state.spaceId,
            milestone: state.milestone === true,
            status: state.status,
            version: state.version,
            instant: await store.clock.now(),
            eligibleReviewerIds,
            watcherIds: [],
          });
        },
        { snapshot: true },
      )
      .catch((error: unknown) => {
        throw taskApprovalRefusal(error);
      });
  }
  // #endregion
}

import type { ApprovalActor } from '../../../../models/approval/approval-actor.model.js';
import type { ApprovalTaskContext } from '../../../../models/approval/approval-task-context.model.js';

/** Task-owned transaction, locking and current-access checks for approval operations. */
export interface ApprovalTasks {
  // #region Methods
  /** Members of this contract. */
  read<T>(
    input: ApprovalActor,
    operation: {
      discoverReviewerIds(taskId: string): Promise<readonly string[]>;
      read(context: ApprovalTaskContext): Promise<T>;
    },
  ): Promise<T>;
  change<T>(
    input: ApprovalActor & {
      readonly expectedVersions: readonly number[] | null;
      readonly reviewerUserIds: readonly string[];
    },
    operation: {
      discoverReviewerIds(taskId: string): Promise<readonly string[]>;
      decide(context: ApprovalTaskContext): Promise<{
        readonly changed: boolean;
        readonly status: 'progress' | 'done' | null;
        readonly finish: (context: ApprovalTaskContext) => Promise<T>;
      }>;
    },
  ): Promise<T>;
  // #endregion
}

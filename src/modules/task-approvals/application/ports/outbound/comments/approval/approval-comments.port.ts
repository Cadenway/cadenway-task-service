import type { ApprovalTaskContext } from '../../../../models/approval/approval-task-context.model.js';

/** Task-comment capability joined to the approval transaction. */
export interface ApprovalComments {
  // #region Methods
  /** Members of this contract. */
  allocateId(): Promise<string>;
  create(input: {
    readonly context: ApprovalTaskContext;
    readonly commentId: string;
    readonly authorUserId: string;
    readonly body: string;
  }): Promise<void>;
  // #endregion
}

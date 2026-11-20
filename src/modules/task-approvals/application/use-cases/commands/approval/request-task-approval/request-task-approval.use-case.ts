import type { ApprovalOperations } from '../../../../services/approval/approval-operations.service.js';
import type { RequestTaskApprovalInput } from './request-task-approval.input.js';
import type { RequestTaskApprovalOutput } from './request-task-approval.output.js';

/** Starts or replaces a task approval round. */
export class RequestTaskApproval {
  // #region Constructor
  /** Binds the approval operations. */
  public constructor(private readonly operations: ApprovalOperations) {}
  // #endregion

  // #region Methods
  /** Runs the authorized operation. */
  public execute(input: RequestTaskApprovalInput): Promise<RequestTaskApprovalOutput> {
    return this.operations.request(input);
  }
  // #endregion
}
